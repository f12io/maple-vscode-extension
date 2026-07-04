export interface ClassInstance {
  value: string;
  start: number; // Absolute offset in document
  end: number;
  tagName?: string;
}

/** A [start, end) offset range whose contents are excluded via disable comments. */
export interface DisabledBlock {
  start: number;
  end: number;
}

/** Keeps the first instance seen for each start offset. */
export function dedupeInstancesByStart(
  instances: Array<ClassInstance>,
): Array<ClassInstance> {
  const uniqueInstances: Array<ClassInstance> = [];
  const seenStarts = new Set<number>();

  for (const instance of instances) {
    if (!seenStarts.has(instance.start)) {
      seenStarts.add(instance.start);
      uniqueInstances.push(instance);
    }
  }

  return uniqueInstances;
}

/** A string literal located by a language service's `matchStringLiteral`. */
export interface StringLiteralMatch {
  /** Index of the opening delimiter (including any prefix, e.g. `$@`) */
  start: number;
  contentStart: number;
  contentEnd: number;
  /** Index just after the closing delimiter */
  endIndex: number;
  /** The opening delimiter as written: `$@"`, `$"`, `"`, `'` or `` ` `` */
  rawDelimiter: string;
  /** Content contains interpolation holes this service can parse */
  isInterpolated: boolean;
}

/** Callback invoked for each interpolated string found during extraction. */
export type StringExtractionCallback = (
  value: string,
  offset: number,
  text: string,
  matchIndex: number,
  literal?: StringLiteralMatch,
) => void;

export interface Token {
  value: string;
  start: number;
  end: number;
  hasInterpolation?: boolean;
}

export interface ILanguageService {
  languageIds: Array<string>;
  extractClasses(text: string): Array<ClassInstance>;
  isInsideClassAttribute(text: string, offset: number): boolean;
  tokenizeClassesWithIndices(str: string): Array<Token>;
  /**
   * Resolves source-escaped class text to what the framework actually renders
   * into the DOM (e.g. Razor renders `@@md:p-2` as `@md:p-2`). Used where the
   * runtime CSS matters (hover), not for document ranges.
   */
  getRenderedClassText(word: string): string;
  /**
   * Returns the delimiters to use when a formatted string must span multiple
   * lines, or undefined when the string cannot legally hold newlines in this
   * language (the formatter then leaves it untouched). `rawQuote` is the
   * opening delimiter as written ($@", $", ", ' or `).
   */
  getMultilineStringDelimiters(
    rawQuote: string,
    content: string,
  ): { open: string; close: string } | undefined;
  /**
   * Matches a string literal of this language starting at `index`, or
   * undefined when no (terminated) literal starts there. This is the single
   * place a language's string grammar lives — generic helpers delegate here
   * instead of hardcoding delimiter knowledge.
   */
  matchStringLiteral(
    text: string,
    index: number,
  ): StringLiteralMatch | undefined;
  /**
   * Formats a bare class-bearing expression (e.g. a ternary with string
   * arms), preserving its structure — the same treatment interpolations get
   * inside class attributes. Returns undefined when the expression has no
   * structure this language knows how to format.
   */
  formatExpression(
    expr: string,
    baseIndent: string,
    maxClassesPerLine: number,
    formatClassesFn: (
      value: string,
      indent: string,
      maxClasses: number,
    ) => string,
  ): string | undefined;
  formatInterpolation(
    cls: string,
    baseIndent: string,
    maxClassesPerLine: number,
    formatClassesFn: (
      value: string,
      indent: string,
      maxClasses: number,
    ) => string,
  ): string;
}
