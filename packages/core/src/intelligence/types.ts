/**
 * Shared inputs for the editor-agnostic language intelligence APIs
 * (semantic tokens, completions, hover).
 */
export interface IntelligenceContext {
  /** Resolves the language service used for region discovery. */
  languageId: string;
  /**
   * Aliases the host knows about beyond the ones defined in `text` itself
   * (e.g. the VS Code workspace alias scan). Definitions inside the document
   * are always picked up by core, so hosts without an external source may
   * omit this.
   */
  localAliases?: ReadonlyMap<string, string>;
}
