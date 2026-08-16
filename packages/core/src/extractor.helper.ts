import {
  ClassInstance,
  CommentSyntax,
  ILanguageService,
  StringExtractionCallback,
  StringLiteralMatch,
} from './LanguageService';

import {
  CLOSING_TAG_START_REGEX,
  getDirectiveRegexes,
  MAPLE_CLASS_REGEX_NON_GLOBAL,
  OBJECT_KEY_REGEX,
  OPENING_TAG_START_REGEX,
  OPT_IN_COMMENT_REGEX,
  START_COMMENT_STAR_REGEX,
  START_TAG_NAME_REGEX,
  TOKEN_SPLIT_REGEX,
  VOID_ELEMENTS,
} from './regex';

/** `"`, `'`, `` ` `` — as codes, for scanners that work off charCodeAt */
const QUOTE_CHAR_CODES = [0x22, 0x27, 0x60];

export function isQuote(char: string): boolean {
  return QUOTE_CHAR_CODES.includes(char.charCodeAt(0));
}

/**
 * Upper bound on how far a single scan may advance before giving up.
 * Guards every hand-rolled scanner against runaway scans on malformed input
 * (e.g. an unterminated attribute in a huge minified file).
 */
export const MAX_SCAN_LENGTH = 200_000;

/** Enough to read a tag name and its terminator when probing markup. */
const MAX_TAG_NAME_LENGTH = 64;

/**
 * Skips a quoted string literal. `index` must hold the opening quote (`'` or
 * `"`); backslash escapes are honored, so an escaped quote does not close the
 * string. Returns the index just after the closing quote, or the scan bound
 * when the string is unterminated.
 */
export function skipStringLiteral(text: string, index: number): number {
  const quote = text[index];
  const limit = Math.min(text.length, index + MAX_SCAN_LENGTH);
  let i = index + 1;
  while (i < limit) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === quote) {
      return i + 1;
    }
    i++;
  }
  return limit;
}

export function findClosingQuote(
  text: string,
  startIndex: number,
  quote: string,
): number {
  let parenDepth = 0;
  let braceDepth = 0;
  let i = startIndex;

  while (i < text.length) {
    const char = text[i];
    const prevChar = i > 0 ? text[i - 1] : '';

    if (prevChar === '\\') {
      i++;
      continue;
    }

    if (parenDepth > 0 && (char === '"' || char === "'")) {
      // Inside a Razor @(...) expression a quote starts a C# string literal,
      // which may legally contain parens, braces, or the attribute's own
      // quote char. Skip it entirely.
      i = skipStringLiteral(text, i);
      continue;
    }

    if (char === '(' && prevChar === '@') {
      parenDepth++;
    } else if (char === '(' && parenDepth > 0) {
      parenDepth++;
    } else if (char === ')') {
      if (parenDepth > 0) parenDepth--;
    } else if (char === '{') {
      braceDepth++;
    } else if (char === '}') {
      if (braceDepth > 0) braceDepth--;
    } else if (char === quote) {
      if (parenDepth === 0 && braceDepth === 0) {
        return i;
      }
    }

    if (i - startIndex > MAX_SCAN_LENGTH) {
      return -1; // safety timeout
    }

    i++;
  }
  return -1;
}

export function getTagNameBackwards(
  text: string,
  index: number,
): string | undefined {
  const prefix = text.substring(0, index);
  const lastOpen = prefix.lastIndexOf('<');
  const lastClose = prefix.lastIndexOf('>');
  if (lastOpen !== -1 && lastOpen > lastClose) {
    const match = text.substring(lastOpen + 1).match(START_TAG_NAME_REGEX);
    if (match) {
      return match[1].toLowerCase();
    }
  }
  return undefined;
}

/**
 * Comment syntaxes bucketed by the char code they open with, so the line
 * scanner tests only the ones that could start here instead of the whole set.
 * Keyed by the syntax array itself, which each language service owns and
 * reuses.
 */
const syntaxIndexCache = new WeakMap<
  Array<CommentSyntax>,
  Map<number, Array<CommentSyntax>>
>();

interface CommentRange {
  start: number;
  end: number;
}

/** Shared, never mutated — most lines hold no comment at all */
const NO_COMMENT_RANGES: ReadonlyArray<CommentRange> = Object.freeze([]);

function getSyntaxIndex(
  syntaxes: Array<CommentSyntax>,
): Map<number, Array<CommentSyntax>> {
  const cached = syntaxIndexCache.get(syntaxes);
  if (cached) return cached;

  const index = new Map<number, Array<CommentSyntax>>();
  for (const syntax of syntaxes) {
    const code = syntax.open.charCodeAt(0);
    const bucket = index.get(code);
    if (bucket) bucket.push(syntax);
    else index.set(code, [syntax]);
  }

  syntaxIndexCache.set(syntaxes, index);
  return index;
}

/**
 * The spans of `line` that sit inside a comment.
 *
 * Quoted strings are skipped, so a URL's `//`, or a `/*` sitting in an
 * attribute value, is not read as a comment opener, and a comment that closes
 * mid-line (`<!-- note --> <div class="p-4">`) covers only its own span. Once
 * an unterminated string is reached the rest of the line is inside it, so no
 * further comment can open.
 */
function computeCommentRanges(
  line: string,
  syntaxes: Array<CommentSyntax>,
): ReadonlyArray<CommentRange> {
  // A JSDoc continuation line comments out everything on it. The trailing
  // separator in the pattern keeps Angular's structural directives
  // (`*ngIf="cond" class="p-4"`) out of this branch.
  if (START_COMMENT_STAR_REGEX.test(line)) {
    return [{ start: 0, end: line.length }];
  }

  // Quick reject: a handful of native substring scans beat walking the line
  // character by character, and almost no line holds an opener at all
  let mayHaveComment = false;
  for (const syntax of syntaxes) {
    if (line.includes(syntax.open)) {
      mayHaveComment = true;
      break;
    }
  }
  if (!mayHaveComment) return NO_COMMENT_RANGES;

  const index = getSyntaxIndex(syntaxes);
  const ranges: Array<CommentRange> = [];
  let i = 0;

  outer: while (i < line.length) {
    const charCode = line.charCodeAt(i);

    if (
      charCode === QUOTE_CHAR_CODES[0] ||
      charCode === QUOTE_CHAR_CODES[1] ||
      charCode === QUOTE_CHAR_CODES[2]
    ) {
      const end = skipStringLiteral(line, i);
      if (end >= line.length) return ranges;
      i = end;
      continue;
    }

    const candidates = index.get(charCode);
    if (candidates === undefined) {
      i++;
      continue;
    }

    for (const syntax of candidates) {
      if (!line.startsWith(syntax.open, i)) continue;

      const next = line[i + syntax.open.length];
      if (syntax.notFollowedBy !== undefined && next === syntax.notFollowedBy) {
        continue;
      }

      if (syntax.close === undefined) {
        ranges.push({ start: i, end: line.length });
        return ranges;
      }

      const close = line.indexOf(syntax.close, i + syntax.open.length);
      if (close === -1) {
        ranges.push({ start: i, end: line.length });
        return ranges;
      }

      ranges.push({ start: i, end: close + syntax.close.length });
      i = close + syntax.close.length;
      continue outer;
    }

    i++;
  }

  return ranges;
}

/**
 * The spans of `line` covered by a string literal that both opens and closes
 * on it.
 *
 * Only closed literals count. An unterminated quote is how a multi-line
 * template opens (`` template: ` ``), and the markup inside one is real
 * markup — directives written there still apply.
 */
function computeStringRanges(line: string): ReadonlyArray<CommentRange> {
  if (
    !QUOTE_CHAR_CODES.some((code) => line.includes(String.fromCharCode(code)))
  )
    return NO_COMMENT_RANGES;

  const ranges: Array<CommentRange> = [];
  let i = 0;

  while (i < line.length) {
    if (isQuote(line[i])) {
      const end = skipStringLiteral(line, i);
      if (end >= line.length) break; // unterminated
      ranges.push({ start: i, end });
      i = end;
      continue;
    }
    i++;
  }

  return ranges;
}

interface LineInfo {
  start: number;
  line: string;
  commentRanges: ReadonlyArray<CommentRange>;
  /** Lazily filled by `isLineDisabled` */
  disabled?: boolean;
  /** Lazily filled by `isInsideStringLiteral` — only directives need it */
  stringRanges?: ReadonlyArray<CommentRange>;
}

/**
 * Comment syntaxes shared by every supported language: JavaScript-family
 * comments (which appear in scripts everywhere) and HTML comments (which
 * appear in every template dialect). Languages add their own on top.
 */
export const DEFAULT_COMMENT_SYNTAXES: Array<CommentSyntax> = [
  { open: '//' },
  { open: '/*', close: '*/' },
  { open: '<!--', close: '-->' },
];

/**
 * The syntaxes in force for the extraction currently running. A language
 * service activates its own before it walks a document, so `#` reads as a
 * comment in PHP without doing the same to Angular's `#ref` or Svelte's
 * `{#if}`.
 */
let activeCommentSyntaxes = DEFAULT_COMMENT_SYNTAXES;

export function activateCommentSyntaxes(syntaxes: Array<CommentSyntax>) {
  if (syntaxes === activeCommentSyntaxes) return;
  activeCommentSyntaxes = syntaxes;
  lineInfoCache = undefined; // cached ranges were scanned with the old set
}

/**
 * One-entry cache of the line surrounding the last queried position.
 *
 * Both line checks run for every class instance, and a minified document is
 * a single line as long as the file, so rescanning per instance is quadratic.
 * Instances arrive in near document order, making a single slot enough — and
 * exactly right for the one-line case, where every lookup hits it. Strings
 * are immutable, so an entry can only go stale when `text` itself changes.
 */
let lineInfoCache: { text: string; info: LineInfo } | undefined;

function getLineInfo(text: string, index: number): LineInfo {
  const start = text.lastIndexOf('\n', index) + 1;

  const cached = lineInfoCache;
  if (cached?.text === text && cached.info.start === start) {
    return cached.info;
  }

  let end = text.indexOf('\n', start);
  if (end === -1) end = text.length;

  const line = text.substring(start, end);
  const info: LineInfo = {
    start,
    line,
    commentRanges: computeCommentRanges(line, activeCommentSyntaxes),
  };

  lineInfoCache = { text, info };
  return info;
}

export function isCommentedOut(text: string, index: number): boolean {
  const info = getLineInfo(text, index);
  const offset = index - info.start;

  for (const range of info.commentRanges) {
    // Strict bounds: a position at the opener has nothing open before it, and
    // one at the closer is already past the comment
    if (offset > range.start && offset < range.end) return true;
  }

  return false;
}

/**
 * The string literal closed on this line that contains `index`, in document
 * offsets, or undefined. The range spans the quotes themselves.
 */
export function findEnclosingStringLiteral(
  text: string,
  index: number,
): { start: number; end: number } | undefined {
  const info = getLineInfo(text, index);
  info.stringRanges ??= computeStringRanges(info.line);

  const offset = index - info.start;
  for (const range of info.stringRanges) {
    if (offset > range.start && offset < range.end) {
      return { start: info.start + range.start, end: info.start + range.end };
    }
  }

  return undefined;
}

/**
 * True when `index` sits inside a string literal closed on the same line —
 * `const doc = '/* maple-disable *' + '/'` is documentation data, not a
 * directive the file is issuing.
 */
export function isInsideStringLiteral(text: string, index: number): boolean {
  return findEnclosingStringLiteral(text, index) !== undefined;
}

/** Index of the `>` ending the tag at `open`, or -1. Skips quoted values. */
function findTagEnd(text: string, open: number): number {
  const limit = Math.min(text.length, open + MAX_SCAN_LENGTH);
  let i = open + 1;

  while (i < limit) {
    if (isQuote(text[i])) {
      i = skipStringLiteral(text, i);
      continue;
    }
    if (text[i] === '>') return i;
    i++;
  }

  return -1;
}

/**
 * Name of the first element that *closes* after `from` without having opened
 * after it — the element whose text `from` sits in — or undefined when the
 * scan runs out of document first.
 *
 * Elements opening in between are counted, so a directive followed by a
 * sibling (`… <span>n</span></code>`) still resolves to the enclosing `code`.
 * Sequences that only look like tags (`a < b`, `Array<string>`) can raise the
 * depth but never report a close, so code is never mistaken for markup.
 */
function findEnclosingCloseTag(text: string, from: number): string | undefined {
  const limit = Math.min(text.length, from + MAX_SCAN_LENGTH);
  let depth = 0;
  let i = from;

  while (i < limit) {
    const open = text.indexOf('<', i);
    if (open === -1 || open >= limit) return undefined;

    const probe = text.substring(open, open + MAX_TAG_NAME_LENGTH);

    const closing = CLOSING_TAG_START_REGEX.exec(probe);
    if (closing) {
      if (depth === 0) return closing[1];
      depth--;
      i = open + closing[0].length;
      continue;
    }

    const opening = OPENING_TAG_START_REGEX.exec(probe);
    if (!opening) {
      i = open + 1;
      continue;
    }

    const tagEnd = findTagEnd(text, open);
    if (tagEnd === -1) return undefined;

    const selfClosing =
      text[tagEnd - 1] === '/' || VOID_ELEMENTS.has(opening[1].toLowerCase());
    if (!selfClosing) depth++;

    i = tagEnd + 1;
  }

  return undefined;
}

export function isDirectiveInMarkupText(
  text: string,
  start: number,
  end: number,
): boolean {
  let before = start - 1;
  while (before >= 0 && text[before].trim() === '') before--;
  let after = end;
  while (after < text.length && text[after].trim() === '') after++;
  if (text[before] === '{' && text[after] === '}') return false;

  const enclosing = findEnclosingCloseTag(text, end);
  if (enclosing === undefined) return false;

  // That element must also have opened before the directive
  const openIndex = text.lastIndexOf(`<${enclosing}`, start);
  if (openIndex === -1) return false;

  const charAfterName = text[openIndex + enclosing.length + 1];
  return charAfterName === undefined || /[\s/>]/.test(charAfterName);
}

export interface DirectiveMatch {
  start: number;
  end: number;
}

export function findDirectives(
  haystack: string,
  name: string,
  context: { text: string; offset: number } = { text: haystack, offset: 0 },
): Array<DirectiveMatch> {
  // Every comment form embeds the bare name, so this rejects the common case
  // without running a single regex.
  if (!haystack.includes(name)) return [];

  const { markup, script } = getDirectiveRegexes(name);
  const matches: Array<DirectiveMatch> = [];

  for (const match of haystack.matchAll(markup)) {
    const start = context.offset + match.index;
    // A directive quoted inside another comment, or inside a string literal,
    // is documentation about the directive rather than a use of it
    if (isCommentedOut(context.text, start)) continue;
    if (isInsideStringLiteral(context.text, start)) continue;
    matches.push({ start, end: start + match[0].length });
  }

  for (const match of haystack.matchAll(script)) {
    const start = context.offset + match.index;
    const end = start + match[0].length;
    // Twig's `{# ... #}` is matched by both forms; keep it once
    if (matches.some((m) => start >= m.start && start < m.end)) continue;
    if (isCommentedOut(context.text, start)) continue;
    if (isInsideStringLiteral(context.text, start)) continue;
    if (isDirectiveInMarkupText(context.text, start, end)) continue;
    matches.push({ start, end });
  }

  return matches.sort((a, b) => a.start - b.start);
}

export function hasDirective(text: string, name: string): boolean {
  return findDirectives(text, name).length > 0;
}

/** Honored occurrences of a directive on the line starting at `lineStart`. */
function hasDirectiveOnLine(
  text: string,
  lineStart: number,
  line: string,
  name: string,
): boolean {
  return findDirectives(line, name, { text, offset: lineStart }).length > 0;
}

function computeLineDisabled(text: string, info: LineInfo): boolean {
  if (hasDirectiveOnLine(text, info.start, info.line, 'maple-disable-line')) {
    return true;
  }

  if (info.start === 0) return false;

  const prevEnd = info.start - 1;
  const prevStart = text.lastIndexOf('\n', prevEnd - 1) + 1;
  const prevLine = text.substring(prevStart, prevEnd);

  return hasDirectiveOnLine(
    text,
    prevStart,
    prevLine,
    'maple-disable-next-line',
  );
}

export function isLineDisabled(text: string, index: number): boolean {
  const info = getLineInfo(text, index);

  if (info.disabled === undefined) {
    info.disabled = computeLineDisabled(text, info);

    lineInfoCache = { text, info };
  }

  return info.disabled;
}

export function getDisabledBlocks(
  text: string,
): Array<{ start: number; end: number }> {
  const blocks: Array<{ start: number; end: number }> = [];
  const disableMatches = findDirectives(text, 'maple-disable');
  const enableMatches = findDirectives(text, 'maple-enable');

  let currentEnd = 0;
  for (const disableMatch of disableMatches) {
    const start = disableMatch.start;
    if (start < currentEnd) continue;

    const enableMatch = enableMatches.find((m) => m.start > start);
    const end = enableMatch ? enableMatch.end : text.length;
    blocks.push({ start, end });
    currentEnd = end;
  }

  return blocks;
}

export function shouldSkipMatch(
  text: string,
  index: number,
  disabledBlocks: Array<{ start: number; end: number }> = [],
): boolean {
  if (isCommentedOut(text, index) || isLineDisabled(text, index)) return true;

  for (const block of disabledBlocks) {
    if (index >= block.start && index <= block.end) return true;
  }

  return false;
}

export function pushInstance(
  instances: Array<ClassInstance>,
  value: string,
  start: number,
  text: string,
  matchIndex: number,
  disabledBlocks: Array<{ start: number; end: number }> = [],
) {
  if (shouldSkipMatch(text, start, disabledBlocks)) return;

  instances.push({
    value,
    start,
    end: start + value.length,
    tagName: getTagNameBackwards(text, matchIndex),
  });
}

export function extractUnquotedObjectKeys(
  expr: string,
  exprStart: number,
  text: string,
  matchIndex: number,
  instances: Array<ClassInstance>,
  disabledBlocks: Array<{ start: number; end: number }> = [],
) {
  for (const keyMatch of expr.matchAll(OBJECT_KEY_REGEX)) {
    const value = keyMatch[1];
    const keyIdx = keyMatch[0].indexOf(value);
    const start = exprStart + keyMatch.index + keyIdx;
    pushInstance(instances, value, start, text, matchIndex, disabledBlocks);
  }
}

export interface OptInRegion {
  /** Index of the opt-in comment match */
  matchIndex: number;
  /** Start of the opted-in expression (first non-whitespace after comment) */
  regionStart: number;
  /** End of the opted-in expression (exclusive of the terminator) */
  regionEnd: number;
  /** Every string literal found in the region, in document order */
  literals: Array<StringLiteralMatch>;
}

/**
 * Locates all string literals opted in by a maple comment. The comment marks
 * the whole following expression — like a class attribute, every string
 * literal in it is maple (ternary arms, concatenation parts, ...). String
 * boundaries are delegated to the language service, so each language's
 * string grammar lives in exactly one place.
 *
 * The region ends at a `;` or `,` at bracket depth 0, at a closing bracket
 * that was never opened inside the region, or at a plain assignment `=`
 * (guarding against swallowing the next statement in semicolon-less code;
 * comparison/arrow operators like `==`, `=>`, `<=` do not terminate).
 */
export function findOptInRegions(
  service: ILanguageService,
  text: string,
): Array<OptInRegion> {
  const results: Array<OptInRegion> = [];
  let currentEnd = 0;

  for (const match of text.matchAll(OPT_IN_COMMENT_REGEX)) {
    if (match.index < currentEnd) continue;
    // An opt-in comment quoted as documentation — in a string, in another
    // comment, or printed inside markup — is just text
    if (isInsideStringLiteral(text, match.index)) continue;
    if (isCommentedOut(text, match.index)) continue;
    if (
      isDirectiveInMarkupText(text, match.index, match.index + match[0].length)
    ) {
      continue;
    }

    let i = match.index + match[0].length;
    while (i < text.length && text[i].trim() === '') i++;

    // Objects (/* maple */ { ... }) are handled by the object opt-in path
    if (text[i] === '{') continue;

    const regionStart = i;
    const regionLimit = Math.min(text.length, i + MAX_SCAN_LENGTH);
    const literals: Array<StringLiteralMatch> = [];
    let depth = 0;

    while (i < regionLimit) {
      const literal = service.matchStringLiteral(text, i);
      if (literal) {
        literals.push(literal);
        i = literal.endIndex;
        continue;
      }

      const ch = text[i];
      if (ch === '(' || ch === '[' || ch === '{') {
        depth++;
      } else if (ch === ')' || ch === ']' || ch === '}') {
        if (depth === 0) break; // closes a bracket opened before the region
        depth--;
      } else if (depth === 0 && (ch === ';' || ch === ',')) {
        break;
      } else if (
        depth === 0 &&
        ch === '=' &&
        text[i + 1] !== '=' &&
        text[i + 1] !== '>' &&
        !'=<>!+-*/%&|^'.includes(text[i - 1] ?? '')
      ) {
        break; // plain assignment: the next statement has begun
      }
      i++;
    }

    if (literals.length > 0) {
      results.push({
        matchIndex: match.index,
        regionStart,
        regionEnd: i,
        literals,
      });
    }
    currentEnd = i;
  }

  return results;
}

export function extractStringLiterals(
  service: ILanguageService,
  expr: string,
  exprStart: number,
  text: string,
  matchIndex: number,
  instances: Array<ClassInstance>,
  disabledBlocks: Array<{ start: number; end: number }> = [],
  extractCallback?: StringExtractionCallback,
) {
  let j = 0;

  while (j < expr.length) {
    const literal = service.matchStringLiteral(expr, j);
    if (!literal) {
      j++;
      continue;
    }

    const value = expr.substring(literal.contentStart, literal.contentEnd);
    const start = exprStart + literal.contentStart;

    if (literal.isInterpolated) {
      extractCallback?.(value, start, text, matchIndex, literal);
    } else {
      pushInstance(instances, value, start, text, matchIndex, disabledBlocks);
    }

    j = literal.endIndex;
  }
}

export function getExactWordRangeAtPosition(
  document: any,
  position: any,
): { wordRange: any | undefined; currentWord: string } {
  const wordRange = document.getWordRangeAtPosition(
    position,
    MAPLE_CLASS_REGEX_NON_GLOBAL,
  );
  const currentWord = wordRange ? document.getText(wordRange) : '';

  if (!wordRange) {
    return { wordRange: undefined, currentWord: '' };
  }

  const cursorOffsetInWord = position.character - wordRange.start.character;
  const tokens = currentWord.split(TOKEN_SPLIT_REGEX);
  let currentOffset = 0;

  let finalRange = wordRange;
  let finalWord = '';

  for (const token of tokens) {
    const start = currentOffset;
    const end = currentOffset + token.length;

    if (cursorOffsetInWord > start && cursorOffsetInWord <= end) {
      if (!isQuote(token) && token.trim() !== '') {
        finalWord = token;
        finalRange = wordRange.with(
          wordRange.start.translate(0, start),
          wordRange.start.translate(0, end),
        );
      } else {
        finalRange = undefined;
        finalWord = '';
      }
      break;
    } else if (cursorOffsetInWord === 0 && start === 0) {
      if (!isQuote(token) && token.trim() !== '') {
        finalWord = token;
        finalRange = wordRange.with(
          wordRange.start.translate(0, start),
          wordRange.start.translate(0, end),
        );
        break;
      }
    }
    currentOffset = end;
  }

  if (finalWord && finalRange) {
    // Strip trailing HTML characters if it still bled (e.g. `bgc-red>`)
    const cleanWord = finalWord.replace(/[><]+$/, '').replace(/<![\-]*$/, '');
    if (cleanWord !== finalWord) {
      const diff = finalWord.length - cleanWord.length;
      finalRange = finalRange.with(
        undefined,
        finalRange.end.translate(0, -diff),
      );
      finalWord = cleanWord;
    }
  }

  return { wordRange: finalRange, currentWord: finalWord };
}

export function isCvaCall(functionName: string | undefined): boolean {
  return functionName?.toLowerCase() === 'cva';
}
