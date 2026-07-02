export interface ClassInstance {
  value: string;
  start: number; // Absolute offset in document
  end: number;
  tagName?: string;
}

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
