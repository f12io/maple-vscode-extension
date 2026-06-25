/**
 * Centralized Regular Expressions
 *
 * Global (/g) regexes are provided as factory functions `get...Regex()`
 * so that their state (`lastIndex`) doesn't persist across different calls
 * causing unexpected bugs.
 */

// ============================================================================
// Maple Token Parsing
// ============================================================================
export const MAPLE_CLASS_PATTERN = `[\\w\\-@:\\[\\]\\#\\.\\%\\|_\\/\\(\\)\\,\\=\\!\\^\\&\\>\\<\\~\\+\\*\\'\\"]+`;

/** Global matcher for all maple class tokens. */
export const getMapleClassRegex = () => new RegExp(MAPLE_CLASS_PATTERN, 'g');

/** Non-global matcher for a single maple class token. */
export const MAPLE_CLASS_REGEX_NON_GLOBAL = new RegExp(MAPLE_CLASS_PATTERN);

// ============================================================================
// Alias Extraction
// ============================================================================
export const ALIAS_PREFIX = `--alias-`;
/** Matches: --alias-name=value */
export const getAliasRegex = () =>
  new RegExp(`${ALIAS_PREFIX}([a-zA-Z0-9\\-]+)=([^"'\\s]+)`, 'g');

// ============================================================================
// Disable / Enable Comments
// ============================================================================
export const getDisableRegex = () => /\/\*\s*maple-disable\s*\*\//g;
export const getEnableRegex = () => /\/\*\s*maple-enable\s*\*\//g;

// ============================================================================
// General Parsing Utilities
// ============================================================================

/** Matches a word characters sequence preceded by whitespace at start of string */
export const START_TAG_NAME_REGEX = /^\s*([a-zA-Z0-9\-]+)/;

/** Matches an asterisk after optional whitespace at the start of string */
export const START_COMMENT_STAR_REGEX = /^\s*\*/;

/** Matches object keys inside an expression that aren't quoted. e.g. { active: true } -> 'active' */
export const getObjectKeyRegex = () => /(?:[{,])\s*([a-zA-Z0-9\-_]+)\s*:/g;

/** Matches string literals in single quotes, double quotes, or backticks */
export const getStringLiteralRegex = () => /(["'`])([\s\S]*?)\1/g;

// ============================================================================
// Attribute & Expression Matchers (Class Extraction)
// ============================================================================

const STANDARD_CLASS_ATTRS = `class|className|CssClass`;
const ANGULAR_VUE_CLASS_ATTRS = `\\[ngClass\\]|:class|\\[class\\]`;
const JS_FRAMEWORK_CLASS_ATTRS = `class|className|classList`;

/** 1. Standard attributes: class="", className="", CssClass="" */
export const getStandardAttrRegex = () =>
  new RegExp(
    `(?:^|[\\s<>])(?:${STANDARD_CLASS_ATTRS})\\s*=\\s*(["'])`,
    'gi',
  );

/** 2. Angular / Vue expressions: [ngClass]="...", :class="...", [class]="..." */
export const getAngularVueExprRegex = () =>
  new RegExp(
    `(?:${ANGULAR_VUE_CLASS_ATTRS})\\s*=\\s*(["'])`,
    'gi',
  );

/** 3. Angular Host Bindings: host: { 'class': '...', '[class.xxx]': 'true' } */
export const getHostRegex = () => /host\s*:\s*\{([^}]+)\}/g;
export const getHostClassRegex = () =>
  /(?:'class'|"class"|class)\s*:\s*(["'`])([\s\S]*?)\1/g;

/** 4. Angular [class.xxx]="..." and Svelte class:xxx="..." */
export const getSpecificClassRegex = () =>
  /(?:\[class\.|class:)([a-zA-Z0-9\-\@\:]+)(?:\]|\=|\s)/g;

/** 5. React / Solid JSX expressions starting with an open brace */
export const getJsxExprStartRegex = () =>
  new RegExp(`(?:^|[\\s<>])(?:${JS_FRAMEWORK_CLASS_ATTRS})\\s*=\\s*\\{`, 'gi');

/** 6. Utility functions: clsx(...), classNames(...), cva(...) */
export const getUtilityFuncStartRegex = () => /(?:clsx|classNames|cva)\s*\(/gi;

/** 7. Explicit opt-in comments for strings */
export const getOptInStringRegex = () =>
  /\/\*\s*maple\s*\*\/\s*(["'`])([\s\S]*?)\1/g;

/** 8. Explicit opt-in comments for objects */
export const getOptInObjectStartRegex = () => /\/\*\s*maple\s*\*\/\s*\{/gi;

// ============================================================================
// Cursor Position Detection (isInsideClassAttribute)
// ============================================================================

/**
 * Massive regex to determine if the cursor is currently inside a class attribute.
 * Deconstructed for readability.
 */
const ANY_STANDARD_OR_VUE_ATTR = `(?:${STANDARD_CLASS_ATTRS}|${ANGULAR_VUE_CLASS_ATTRS})`;
const QUOTED_VAL = `\\s*=\\s*(["'])`;

const HOST_CLASS_VAL = `host\\s*:\\s*\\{[^}]*(?:'class'|"class"|class)\\s*:\\s*(["'\`])`;
const ANGULAR_SPECIFIC_CLASS_VAL = `\\[class\\.[^\\]=]*\\]\\s*=\\s*(["'])`;
const SVELTE_SPECIFIC_CLASS_VAL = `class:[a-zA-Z0-9\\-\\@\\:]+\\s*=\\s*(["'])`;
const REACT_TEMPLATE_LITERAL_VAL = `className\\s*=\\s*\\{\\s*\`([^\`]*)\``;

export const getIsInsideClassAttrRegex = () =>
  new RegExp(
    `${ANY_STANDARD_OR_VUE_ATTR}${QUOTED_VAL}|` +
      `${HOST_CLASS_VAL}|` +
      `${ANGULAR_SPECIFIC_CLASS_VAL}|` +
      `${SVELTE_SPECIFIC_CLASS_VAL}|` +
      REACT_TEMPLATE_LITERAL_VAL,
    'gi',
  );

export const IS_INSIDE_NO_QUOTE_CLASS_REGEX =
  /(?:\[class\.|class:)([a-zA-Z0-9\-\@\:]*)$/i;
