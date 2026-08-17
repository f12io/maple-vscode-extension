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
  detectIndentUnit,
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
  findDirectives,
  findOptInRegions,
  getDisabledBlocks,
  getExactWordAtOffset,
  getTagNameBackwards,
  hasDirective,
  isCommentedOut,
  isDirectiveInMarkupText,
  isLineDisabled,
  isQuote,
  MAX_SCAN_LENGTH,
  pushInstance,
  shouldSkipMatch,
  skipStringLiteral,
  type DirectiveMatch,
  type OptInRegion,
  type WordAtOffset,
} from './extractor.helper';
export * from './intelligence/data';
export {
  generateFractionValues,
  generateSpacingValues,
  getCompletions,
  type MapleCompletion,
  type MapleCompletionKind,
} from './intelligence/completions';
export { getUtilKey } from './intelligence/get-util-key';
export {
  getHoverInfo,
  type MapleAliasExpansion,
  type MapleHover,
} from './intelligence/hover';
export {
  computeSemanticTokens,
  MAPLE_TOKEN_COLORS_DARK_PLUS,
  MAPLE_TOKEN_SCOPES,
  MAPLE_TOKEN_TYPES,
  type MapleSemanticToken,
  type MapleTokenType,
} from './intelligence/semantic-tokens';
export type { IntelligenceContext } from './intelligence/types';
export {
  checkConverted,
  getAliasName,
  isAliasDefinition,
  isAliasMarker,
  isVariable,
  parseMapleToken,
  stripImportant,
  stripQuotes,
  type MapleTokenInfo,
} from './intelligence/maple-parser';
