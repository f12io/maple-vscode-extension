import { parseClass } from '@f12io/maple';
import { getTagNameBackwards } from './extractor.helper';
import { INDENT_WHITESPACE_REGEX } from './regex';
import { ILanguageService, Token } from './LanguageService';
import { LanguageServiceRegistry } from './registry';

/** A plain text replacement, editor-agnostic. Offsets refer to the input text. */
export interface TextReplacement {
  start: number;
  end: number;
  newText: string;
}

/**
 * Indentation of the line `index` sits on. Read from the whole line, not just
 * up to `index`: an attribute region anchors on the whitespace *before* the
 * attribute name (`STANDARD_ATTR_REGEX` opens with `(?:^|[\s<>])`), so an
 * attribute that starts its own line would otherwise report one character less
 * than the line is actually indented.
 */
function getIndentFromIndex(text: string, index: number): string {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  const lineEnd = text.indexOf('\n', lineStart);
  const lineText = text.substring(
    lineStart,
    lineEnd === -1 ? text.length : lineEnd,
  );
  const match = lineText.match(INDENT_WHITESPACE_REGEX);
  return match ? match[0] : '';
}

export interface FormatClassesOptions {
  /**
   * Give every class its own line once the count exceeds `maxClassesPerLine`,
   * instead of packing lines up to the limit. Used for the `html` element,
   * whose classes are alias definitions that read poorly side by side.
   */
  oneClassPerLine?: boolean;
  /** One indentation level; `detectIndentUnit` reads it off the file. */
  indentUnit?: string;
}

/** Used when the file has no indentation to learn from. */
const DEFAULT_INDENT_UNIT = '  ';

/**
 * One indentation level as the file itself writes it: a tab when the file
 * indents with tabs, otherwise the step it most often changes indentation by.
 *
 * The step is counted from differences between consecutive lines rather than
 * from the narrowest indent, because a single odd line — a ` *` comment
 * continuation, a wrapped attribute — must not redefine the whole file's
 * indentation.
 */
export function detectIndentUnit(text: string): string {
  const stepCounts = new Map<number, number>();
  let tabLines = 0;
  let spaceLines = 0;
  let previousWidth = 0;

  for (const line of text.split('\n')) {
    const indent = line.match(INDENT_WHITESPACE_REGEX)?.[0] ?? '';
    if (indent.length === line.length) continue; // blank / whitespace-only

    if (indent.startsWith('\t')) {
      tabLines++;
      previousWidth = 0;
      continue;
    }
    if (indent.length > 0) spaceLines++;

    const step = Math.abs(indent.length - previousWidth);
    if (step > 0) stepCounts.set(step, (stepCounts.get(step) ?? 0) + 1);
    previousWidth = indent.length;
  }

  if (tabLines > 0 && tabLines >= spaceLines) return '\t';

  let bestStep = 0;
  let bestCount = 0;
  for (const [step, count] of stepCounts) {
    // Ties go to the wider step. The narrow ones come from lines that are not
    // structure — a one-space nudge inside a wrapped attribute, a comment
    // continuation — and picking those would shrink the file's indentation.
    if (count > bestCount || (count === bestCount && step > bestStep)) {
      bestStep = step;
      bestCount = count;
    }
  }

  return bestStep > 0 ? ' '.repeat(bestStep) : DEFAULT_INDENT_UNIT;
}

/** Number of line breaks in `str`; 2 or more means the author left a blank line. */
function countNewlines(str: string): number {
  let count = 0;
  for (const char of str) {
    if (char === '\n') count++;
  }
  return count;
}

/**
 * Formats a maple class string: wraps onto multiple lines when it exceeds
 * `maxClassesPerLine`, grouping classes by property type, and recursing into
 * interpolation expressions via the language service.
 *
 * Blank lines the author wrote are preserved: each run of classes between them
 * is a block that formats on its own and never merges with its neighbours.
 */
export function formatClasses(
  classStr: string,
  baseIndent: string,
  maxClassesPerLine: number,
  service: ILanguageService,
  options: FormatClassesOptions = {},
): string {
  const tokens = service.tokenizeClassesWithIndices(classStr);
  if (tokens.length === 0) return '';
  if (tokens.length <= 1 && maxClassesPerLine >= 1) {
    if (tokens.length === 1 && tokens[0].hasInterpolation) {
      // Do not return early, allow interpolation formatting
    } else {
      return tokens.length === 1 ? tokens[0].value : '';
    }
  }

  interface FormatLine {
    classes: Array<string>;
    hasExpression: boolean;
  }

  // A blank line between two classes starts a new block. Blocks are laid out
  // independently, so classes never cross a separator the author put there.
  const blocks: Array<Array<Token>> = [[]];
  let previousEnd = -1;
  for (const token of tokens) {
    if (
      previousEnd !== -1 &&
      countNewlines(classStr.substring(previousEnd, token.start)) > 1
    ) {
      blocks.push([]);
    }
    blocks[blocks.length - 1].push(token);
    previousEnd = token.end;
  }

  const onePerLine =
    options.oneClassPerLine === true && tokens.length > maxClassesPerLine;

  const indentUnit = options.indentUnit ?? DEFAULT_INDENT_UNIT;

  const formatToken = (token: string) =>
    service.formatInterpolation(
      token,
      baseIndent,
      maxClassesPerLine,
      (value, indent, maxClasses) =>
        formatClasses(value, indent, maxClasses, service, options),
      indentUnit,
    );

  const layoutBlock = (blockTokens: Array<Token>): Array<FormatLine> => {
    if (onePerLine) {
      return blockTokens.map((token) => ({
        classes: [
          token.hasInterpolation ? formatToken(token.value) : token.value,
        ],
        hasExpression: token.hasInterpolation === true,
      }));
    }

    const lines: Array<FormatLine> = [];
    let currentLine: FormatLine = { classes: [], hasExpression: false };
    let lastPropType: number | null = null;

    for (const token of blockTokens) {
      const cls = token.value;
      let propType = -1;
      try {
        const parsed = parseClass(cls);
        propType = parsed?.propType ?? -1;
      } catch {
        propType = -1;
      }

      const isNewType =
        tokens.length > maxClassesPerLine &&
        lastPropType !== null &&
        lastPropType !== propType;
      const isOverLimit = currentLine.classes.length >= maxClassesPerLine;
      const isExpression = token.hasInterpolation;

      if (
        currentLine.classes.length > 0 &&
        (isNewType || isOverLimit || isExpression || currentLine.hasExpression)
      ) {
        lines.push(currentLine);
        currentLine = { classes: [], hasExpression: false };
      }

      if (isExpression) {
        currentLine.classes.push(formatToken(cls));
        currentLine.hasExpression = true;
      } else {
        currentLine.classes.push(cls);
      }
      lastPropType = propType;
    }

    if (currentLine.classes.length > 0) {
      lines.push(currentLine);
    }

    // Property-type boundaries can strand a single class on its own line
    // (e.g. `fx` between an opacity and an alias). Merge singleton lines into
    // the previous line when it has room, otherwise into the next one.
    // Expression lines stay isolated by design.
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.classes.length !== 1 || line.hasExpression) continue;

      const prev = lines[i - 1];
      const next = lines[i + 1];
      if (
        prev &&
        !prev.hasExpression &&
        prev.classes.length < maxClassesPerLine
      ) {
        prev.classes.push(...line.classes);
        lines.splice(i, 1);
        i--;
      } else if (
        next &&
        !next.hasExpression &&
        next.classes.length < maxClassesPerLine
      ) {
        next.classes.unshift(...line.classes);
        lines.splice(i, 1);
        i--;
      }
    }

    return lines;
  };

  const blockLines = blocks.map(layoutBlock);

  if (blockLines.length === 1 && blockLines[0].length === 1) {
    return blockLines[0][0].classes.join(' ');
  }

  const indent = baseIndent + indentUnit;
  return (
    '\n' +
    blockLines
      .map((lines) =>
        lines.map((line) => indent + line.classes.join(' ')).join('\n'),
      )
      .join('\n\n') +
    '\n' +
    baseIndent
  );
}

/**
 * Computes formatting replacements for every maple region in the document —
 * class attributes, opt-in expressions, and framework-specific regions — as
 * plain offsets, usable from any host (VS Code, Prettier, CLI).
 */
export function computeFormattingEdits(
  text: string,
  service: ILanguageService,
  maxClassesPerLine: number,
): Array<TextReplacement> {
  const edits: Array<TextReplacement> = [];
  const indentUnit = detectIndentUnit(text);

  // The same regions extraction consumes; when regions overlap (e.g.
  // /* maple */ clsx(...), or clsx inside a className expression) the
  // outermost one formats everything inside it.
  const regions = service.collectRegions(text);
  regions.sort((a, b) => a.start - b.start || b.end - a.end);
  let lastKeptEnd = -1;

  for (const region of regions) {
    if (region.start < lastKeptEnd) continue;
    lastKeptEnd = region.end;

    const allowMultiline = region.allowMultilineLiterals !== false;
    const baseIndent = getIndentFromIndex(text, region.anchor);
    // The html element holds alias definitions; those get a line each.
    const classOptions: FormatClassesOptions = {
      indentUnit,
      oneClassPerLine: getTagNameBackwards(text, region.anchor) === 'html',
    };
    const formatClassesFn = (value: string, indent: string, max: number) =>
      formatClasses(value, indent, max, service, classOptions);

    if (region.kind === 'class-text') {
      const innerString = text.substring(region.start, region.end);
      const formatted = formatClassesFn(
        innerString,
        baseIndent,
        maxClassesPerLine,
      );
      if (formatted === innerString) continue;
      if (formatted.includes('\n') && !allowMultiline) continue;

      edits.push({ start: region.start, end: region.end, newText: formatted });
      continue;
    }

    // Expression regions: structured expressions (ternaries, concatenations)
    // get the same treatment as interpolations inside class attributes.
    const regionText = text.substring(region.start, region.end).trim();
    const regionTextStart =
      region.start +
      text.substring(region.start, region.end).indexOf(regionText);
    const structured = service.formatExpression(
      regionText,
      baseIndent,
      maxClassesPerLine,
      formatClassesFn,
      indentUnit,
    );
    if (structured !== undefined) {
      if (
        structured !== regionText &&
        (allowMultiline || !structured.includes('\n'))
      ) {
        edits.push({
          start: regionTextStart,
          end: regionTextStart + regionText.length,
          newText: structured,
        });
      }
      continue;
    }

    // Otherwise format each string literal on its own.
    let i = region.start;
    while (i < region.end) {
      const literal = service.matchStringLiteral(text, i);
      if (!literal) {
        i++;
        continue;
      }
      i = literal.endIndex;

      const innerString = text.substring(
        literal.contentStart,
        literal.contentEnd,
      );

      const formatted = formatClassesFn(
        innerString,
        baseIndent,
        maxClassesPerLine,
      );
      if (formatted === innerString) continue;

      // Keep the original delimiters for single-line results; multi-line
      // results need delimiters that legally contain newlines (or none
      // exist and the string is left untouched).
      let open = literal.rawDelimiter;
      let close =
        literal.rawDelimiter === '`' ? '`' : literal.rawDelimiter.slice(-1);
      if (formatted.includes('\n')) {
        if (!allowMultiline) continue;
        const delimiters = service.getMultilineStringDelimiters(
          literal.rawDelimiter,
          innerString,
        );
        if (!delimiters) continue;
        open = delimiters.open;
        close = delimiters.close;
      }

      edits.push({
        start: literal.start,
        end: literal.endIndex,
        newText: open + formatted + close,
      });
    }
  }

  return edits;
}

/** Applies non-overlapping replacements to a string. */
export function applyTextEdits(
  text: string,
  edits: Array<TextReplacement>,
): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let result = text;
  for (const edit of sorted) {
    result =
      result.substring(0, edit.start) + edit.newText + result.substring(edit.end);
  }
  return result;
}

/**
 * Formats every maple region in a document and returns the new text.
 * Convenience entry point for non-editor hosts (Prettier plugin, CLI).
 */
export function formatText(
  text: string,
  languageId: string,
  maxClassesPerLine: number,
): string {
  const service = LanguageServiceRegistry.getService(languageId);
  if (!service) return text;
  return applyTextEdits(
    text,
    computeFormattingEdits(text, service, maxClassesPerLine),
  );
}
