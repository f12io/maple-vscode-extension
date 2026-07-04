/**
 * Centralized Regular Expressions
 */

// ============================================================================
// Maple Token Parsing
// ============================================================================
export const MAPLE_CLASS_PATTERN = `[\\w\\-@:\\[\\]\\#\\.\\%\\|_\\/\\(\\)\\,\\=\\!\\^\\&\\>\\<\\~\\+\\*\\'\\"\\{\\}]+`;

/** Global matcher for all maple class tokens. */
export const MAPLE_CLASS_REGEX = new RegExp(MAPLE_CLASS_PATTERN, 'g');

/** Non-global matcher for a single maple class token. */
export const MAPLE_CLASS_REGEX_NON_GLOBAL = new RegExp(MAPLE_CLASS_PATTERN);

/** Non-global matcher for a maple interpolation token (e.g. {space,4}). */
export const MAPLE_INTERPOLATION_REGEX = /^\{[\w\-.,]+\}/;

/** Splits a utility string to extract brace `{...}` and paren `(...)` blocks while keeping them in the resulting array. */
export const MAPLE_PARAMS_SPLIT_REGEX = /(\{[^}]*\}|\([^)]*\))/;

/** Splits parameter lists inside parens `(...)` by colon or comma, retaining delimiters. */
export const MAPLE_PARAM_KEY_VALUE_SPLIT_REGEX = /([:,])/;

/** Splits parameter lists inside braces `{...}` by comma, retaining delimiters. */
export const MAPLE_COMMA_SPLIT_REGEX = /(,)/;

/** Splits class names by underscore, retaining delimiters. */
export const MAPLE_UNDERSCORE_SPLIT_REGEX = /(_)/;

/** Matches an alias parameter placeholder for substitution: {key} or {key,fallback} */
export const getParamSubstituteRegex = (key: string) =>
  new RegExp(
    `\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:,[^}]+)?\\}`,
    'g',
  );

/** Matches an alias parameter placeholder that has a fallback: {key,fallback} */
export const PARAM_FALLBACK_REGEX = /\{[^{}]*,([^}]*)\}/g;

/** Matches any alias parameter placeholder to remove missing parameters: {key} */
export const PARAM_REMOVE_REGEX = /\{[^}]*\}/g;

// ============================================================================
// Alias Extraction
// ============================================================================
export const ALIAS_PREFIX = `--alias-`;
/** Matches: --alias-name=value */
export const ALIAS_REGEX = new RegExp(
  `${ALIAS_PREFIX}([a-zA-Z0-9\\-]+)=([^"'\\s]+)`,
  'g',
);

// ============================================================================
// Disable / Enable Comments
// ============================================================================
export const DISABLE_REGEX = /\/\*\s*maple-disable\s*\*\//g;
export const ENABLE_REGEX = /\/\*\s*maple-enable\s*\*\//g;

// ============================================================================
// HTML Parsing
// ============================================================================
/** Matches the contents of the <head> tag */
export const HEAD_TAG_REGEX = /<head[^>]*>([\s\S]*?)<\/head>/i;

/** Matches a script tag importing maple.js or maple.min.js */
export const MAPLE_SCRIPT_REGEX =
  /<script[^>]+src=["'][^"']*maple(\.min)?\.js(["'?])/i;

// ============================================================================
// General Parsing Utilities
// ============================================================================

/** Matches a word characters sequence preceded by whitespace at start of string */
export const START_TAG_NAME_REGEX = /^\s*([a-zA-Z0-9\-]+)/;

/** Matches an asterisk after optional whitespace at the start of string */
export const START_COMMENT_STAR_REGEX = /^\s*\*/;

/** Splits a string by quotes and whitespace for word tokenization */
export const TOKEN_SPLIT_REGEX = /(["'`\s])/;

// ============================================================================
// Formatter Regexes
// ============================================================================



/** Matches the start of a string literal tagged with maple and captures its quote */

/** Matches object keys inside an expression that aren't quoted. e.g. { active: true } -> 'active' */
export const OBJECT_KEY_REGEX = /(?:[{,])\s*([a-zA-Z0-9\-_]+)\s*:/g;

/** Matches string literals in single quotes, double quotes, or backticks */
export const STRING_LITERAL_REGEX = /(["'`])([\s\S]*?)\1/g;

/** Matches whitespace at the start of a string for indentation */
export const INDENT_WHITESPACE_REGEX = /^\s*/;

// ============================================================================
// Attribute & Expression Matchers (Class Extraction)
// ============================================================================

const STANDARD_CLASS_ATTRS = `class|className|CssClass`;
const ANGULAR_VUE_CLASS_ATTRS = `\\[ngClass\\]|:class|\\[class\\]`;
const JS_FRAMEWORK_CLASS_ATTRS = `class|className|classList`;

/** 1. Standard attributes: class="", className="", CssClass="" */
export const STANDARD_ATTR_REGEX = new RegExp(
  `(?:^|[\\s<>])(?:${STANDARD_CLASS_ATTRS})\\s*=\\s*(["'])`,
  'gi',
);

/** 2. Angular / Vue expressions: [ngClass]="...", :class="...", [class]="..." */
export const ANGULAR_VUE_EXPR_REGEX = new RegExp(
  `(?:${ANGULAR_VUE_CLASS_ATTRS})\\s*=\\s*(["'])`,
  'gi',
);

/** 3. Angular Host Bindings: host: { 'class': '...', '[class.xxx]': 'true' } */
export const HOST_REGEX = /host\s*:\s*\{([^}]+)\}/g;
export const HOST_CLASS_REGEX =
  /(?:'class'|"class"|class)\s*:\s*(["'`])([\s\S]*?)\1/g;

/** 4. Angular [class.xxx]="..." and Svelte class:xxx="..." */
export const SPECIFIC_CLASS_REGEX =
  /(?:\[class\.|class:)([a-zA-Z0-9\-\@\:]+)(?:\]|\=|\s)/g;

/** 5. React / Solid JSX expressions starting with an open brace */
export const JSX_EXPR_START_REGEX = new RegExp(
  `(?:^|[\\s<>])(?:${JS_FRAMEWORK_CLASS_ATTRS})\\s*=\\s*\\{`,
  'gi',
);

/** 6. Utility functions: clsx(...), classNames(...), cva(...) */
export const UTILITY_FUNC_START_REGEX = /(?:clsx|classNames|cva)\s*\(/gi;

/** 7. Explicit opt-in comment marking the following expression as maple */
export const OPT_IN_COMMENT_REGEX = /\/\*\s*maple\s*\*\//g;

/** 8. Explicit opt-in comments for objects */
export const OPT_IN_OBJECT_START_REGEX = /\/\*\s*maple\s*\*\/\s*\{/gi;


