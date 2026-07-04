/**
 * @f12io/maple-language-core
 *
 * Editor-agnostic language tooling for the Maple CSS engine: region
 * discovery, string grammar, class extraction, and the layout engine used by
 * both the VS Code extension and the Prettier plugin.
 */

export * from './LanguageService';
export { LanguageServiceRegistry } from './registry';
export {
  applyTextEdits,
  computeFormattingEdits,
  formatClasses,
  formatText,
} from './formatter';
export type { TextReplacement } from './formatter';
export {
  BaseLanguageService,
  type InterpolationContext,
  type InterpolationMatch,
} from './languages/BaseLanguageService';
export * from './regex';
export * from './language-definitions';
export {
  findClosingQuote,
  findOptInRegions,
  getDisabledBlocks,
  getExactWordRangeAtPosition,
  getTagNameBackwards,
  isCommentedOut,
  isLineDisabled,
  isQuote,
  MAX_SCAN_LENGTH,
  pushInstance,
  shouldSkipMatch,
  skipStringLiteral,
  type OptInRegion,
} from './extractor.helper';
