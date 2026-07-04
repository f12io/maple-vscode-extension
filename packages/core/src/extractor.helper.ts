import {
  ClassInstance,
  ILanguageService,
  StringExtractionCallback,
  StringLiteralMatch,
} from './LanguageService';

import {
  DISABLE_REGEX,
  ENABLE_REGEX,
  MAPLE_CLASS_REGEX_NON_GLOBAL,
  OBJECT_KEY_REGEX,
  OPT_IN_COMMENT_REGEX,
  START_COMMENT_STAR_REGEX,
  START_TAG_NAME_REGEX,
  TOKEN_SPLIT_REGEX,
} from './regex';

export function isQuote(char: string): boolean {
  return char === '"' || char === "'" || char === '`';
}

/**
 * Upper bound on how far a single scan may advance before giving up.
 * Guards every hand-rolled scanner against runaway scans on malformed input
 * (e.g. an unterminated attribute in a huge minified file).
 */
export const MAX_SCAN_LENGTH = 5000;

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

export function isCommentedOut(text: string, index: number): boolean {
  const lastNewline = text.lastIndexOf('\n', index);
  const lineToMatch = text.substring(lastNewline + 1, index);
  if (lineToMatch.includes('//')) return true;
  if (lineToMatch.includes('<!--')) return true;
  if (START_COMMENT_STAR_REGEX.test(lineToMatch)) return true;

  const lastSlashStar = lineToMatch.lastIndexOf('/*');
  if (lastSlashStar !== -1) {
    const lastStarSlash = lineToMatch.lastIndexOf('*/');
    if (lastStarSlash < lastSlashStar) {
      return true;
    }
  }

  return false;
}

export function isLineDisabled(text: string, index: number): boolean {
  const lastNewline = text.lastIndexOf('\n', index);
  let nextNewline = text.indexOf('\n', index);
  if (nextNewline === -1) nextNewline = text.length;

  const fullLine = text.substring(lastNewline + 1, nextNewline);

  if (fullLine.includes('maple-disable-line')) return true;

  if (lastNewline !== -1) {
    const prevNewline = text.lastIndexOf('\n', lastNewline - 1);
    const prevLine = text.substring(prevNewline + 1, lastNewline);
    if (prevLine.includes('maple-disable-next-line')) return true;
  }

  return false;
}

export function getDisabledBlocks(
  text: string,
): Array<{ start: number; end: number }> {
  const blocks: Array<{ start: number; end: number }> = [];
  const disableMatches = [...text.matchAll(DISABLE_REGEX)];
  const enableMatches = [...text.matchAll(ENABLE_REGEX)];

  let currentEnd = 0;
  for (const disableMatch of disableMatches) {
    const start = disableMatch.index;
    if (start < currentEnd) continue;

    const enableMatch = enableMatches.find((m) => m.index > start);
    const end = enableMatch
      ? enableMatch.index + enableMatch[0].length
      : text.length;
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
