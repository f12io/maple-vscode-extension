import { parseClass } from '@f12io/maple';
import { INDENT_WHITESPACE_REGEX } from './regex';
import { ILanguageService } from './LanguageService';
import { LanguageServiceRegistry } from './registry';

/** A plain text replacement, editor-agnostic. Offsets refer to the input text. */
export interface TextReplacement {
  start: number;
  end: number;
  newText: string;
}

function getIndentFromIndex(text: string, index: number): string {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  const lineText = text.substring(lineStart, index);
  const match = lineText.match(INDENT_WHITESPACE_REGEX);
  return match ? match[0] : '';
}

/**
 * Formats a maple class string: wraps onto multiple lines when it exceeds
 * `maxClassesPerLine`, grouping classes by property type, and recursing into
 * interpolation expressions via the language service.
 */
export function formatClasses(
  classStr: string,
  baseIndent: string,
  maxClassesPerLine: number,
  service: ILanguageService,
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

  const lines: Array<FormatLine> = [];
  let currentLine: FormatLine = { classes: [], hasExpression: false };
  let lastPropType: number | null = null;

  for (const token of tokens) {
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
      const formattedCls = service.formatInterpolation(
        cls,
        baseIndent,
        maxClassesPerLine,
        (value, indent, maxClasses) =>
          formatClasses(value, indent, maxClasses, service),
      );
      currentLine.classes.push(formattedCls);
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

  if (lines.length === 1) {
    return lines[0].classes.join(' ');
  }

  const indent = baseIndent + '  ';
  return (
    '\n' +
    lines.map((line) => indent + line.classes.join(' ')).join('\n') +
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

  const formatClassesFn = (value: string, indent: string, max: number) =>
    formatClasses(value, indent, max, service);

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
