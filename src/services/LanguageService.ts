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
}

export interface ILanguageService {
  languageIds: Array<string>;
  extractClasses(text: string): Array<ClassInstance>;
  isInsideClassAttribute(text: string, offset: number): boolean;
  tokenizeClassesWithIndices(str: string): Array<Token>;
}
