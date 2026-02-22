export interface MapleConfig {
  /** Globally enable or disable the extension. */
  enable: boolean;
  /**
   * Glob pattern that restricts which files Maple activates on.
   * e.g. "**\/*.{html,tsx}"
   * When empty the extension activates on all supported languages.
   */
  documentSelector: string;
}

export const DEFAULT_CONFIG: MapleConfig = {
  enable: true,
  documentSelector: "",
};

/** The VS Code configuration section name. */
export const CONFIG_SECTION = "maple" as const;

/** LSP notification sent from client → server when config changes. */
export const CONFIG_CHANGED_NOTIFICATION = "maple/configChanged" as const;
