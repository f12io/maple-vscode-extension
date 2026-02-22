import { DocumentSelector } from 'vscode';

export const DOCUMENT_SELECTOR: DocumentSelector = [
  { language: 'html', scheme: 'file' },
  { language: 'javascriptreact', scheme: 'file' },
  { language: 'typescriptreact', scheme: 'file' },
  { language: 'vue', scheme: 'file' },
  { language: 'svelte', scheme: 'file' },
];

/**
 * Most commonly used CSS properties for initial suggestions
 */
export const POPULAR_ABBREVIATIONS = [
  'd',
  'p',
  'm',
  'w',
  'h',
  'c',
  'bgc',
  'fx',
  'gr',
  'g',
  'jc',
  'ai',
  'fxdir',
  'pos',
  't',
  'r',
  'b',
  'l',
  'z',
  'fs',
  'fw',
  'ta',
  'rad',
  'of',
  'o',
  'square',
];

// Shortcuts (position, display, visibility)
export const SHORTCUTS: Record<string, string> = {
  // Position shortcuts
  abs: 'position: absolute',
  fixed: 'position: fixed',
  rel: 'position: relative',
  sticky: 'position: sticky',
  static: 'position: static',
  // Display shortcuts
  iblock: 'display: inline-block',
  ifx: 'display: inline-flex',
  fx: 'display: flex',
  gr: 'display: grid',
  block: 'display: block',
  none: 'display: none',
  table: 'display: table',
  inline: 'display: inline',
  // Visibility shortcuts
  hidden: 'visibility: hidden',
  visible: 'visibility: visible',
  // Border shortcut
  br: 'border-width: 1px; border-style: solid',
};

// Responsive breakpoints
export const BREAKPOINTS = [
  { name: 'sm', detail: 'Small screens (≥640px)', value: '640px' },
  { name: 'md', detail: 'Medium screens (≥768px)', value: '768px' },
  { name: 'lg', detail: 'Large screens (≥1024px)', value: '1024px' },
  { name: 'xl', detail: 'Extra large (≥1280px)', value: '1280px' },
  { name: '2xl', detail: '2X large (≥1536px)', value: '1536px' },
];

// Viewport/Media queries (prefixed with @)
export const VIEWPORT_QUERIES = [
  { name: '@dark', detail: 'Dark color scheme preference' },
  { name: '@light', detail: 'Light color scheme preference' },
  { name: '@motion-reduce', detail: 'Reduced motion preference' },
  { name: '@motion-safe', detail: 'No motion preference' },
  { name: '@browser', detail: 'Browser display mode' },
  { name: '@standalone', detail: 'Standalone app mode' },
  { name: '@fullscreen', detail: 'Fullscreen mode' },
  { name: '@pip', detail: 'Picture-in-picture mode' },
  { name: '@supports', detail: 'CSS feature support query' },
  { name: '@print', detail: 'Print media' },
];

// Custom media query syntax
export const CUSTOM_MEDIA_QUERIES = [
  { name: 'mnw=', detail: 'Min-width (custom value)' },
  { name: 'mxw=', detail: 'Max-width (custom value)' },
  { name: 'mnh=', detail: 'Min-height (custom value)' },
  { name: 'mxh=', detail: 'Max-height (custom value)' },
  { name: 'mxw-', detail: 'Max-width (breakpoint)' },
  { name: 'mxh-', detail: 'Max-height (breakpoint)' },
  { name: 'landscape', detail: 'Landscape orientation' },
  { name: 'portrait', detail: 'Portrait orientation' },
];

// Transform function keys
export const TRANSFORM_KEYS: Record<string, string> = {
  tl: 'translate',
  tlx: 'translateX',
  tly: 'translateY',
  tlz: 'translateZ',
  tl3: 'translate3d',
  scale: 'scale',
  scalex: 'scaleX',
  scaley: 'scaleY',
  scalez: 'scaleZ',
  scale3: 'scale3d',
  rot: 'rotate',
  rotx: 'rotateX',
  roty: 'rotateY',
  rotz: 'rotateZ',
  rot3: 'rotate3d',
  skew: 'skew',
  skewx: 'skewX',
  skewy: 'skewY',
  mtx: 'matrix',
  mtx3: 'matrix3d',
};

// Filter function keys
export const FILTER_KEYS: Record<string, string> = {
  blur: 'blur',
  brightness: 'brightness',
  contrast: 'contrast',
  dshadow: 'drop-shadow',
  grayscale: 'grayscale',
  hue: 'hue-rotate',
  invert: 'invert',
  saturate: 'saturate',
  sepia: 'sepia',
};

// Backdrop filter function keys
export const BACKDROP_FILTER_KEYS: Record<string, string> = {
  bdblur: 'blur',
  bdbrightness: 'brightness',
  bdcontrast: 'contrast',
  bdshadow: 'drop-shadow',
  bdgrayscale: 'grayscale',
  bdhue: 'hue-rotate',
  bdinvert: 'invert',
  bdsaturate: 'saturate',
  bdsepia: 'sepia',
};

// Gradient function keys
export const GRADIENT_KEYS: Record<string, string> = {
  linear: 'linear-gradient',
  radial: 'radial-gradient',
  conic: 'conic-gradient',
  rlinear: 'repeating-linear-gradient',
  rradial: 'repeating-radial-gradient',
  rconic: 'repeating-conic-gradient',
};

// Selector replacements
export const SELECTOR_REPLACEMENTS: Record<string, string> = {
  odd: ':nth-child(odd)',
  even: ':nth-child(even)',
  rtl: '[dir="rtl"]',
};

export const FLEX_LAYOUT: Record<string, string> = {
  fxcol: 'Flex Column Layout',
  fxrow: 'Flex Row Layout',
};

// Pseudo-classes for self selector (&) suggestions
export const PSEUDO_CLASSES = [
  { name: 'hover', detail: 'Mouse hover state' },
  { name: 'focus', detail: 'Focus state' },
  { name: 'active', detail: 'Active/pressed state' },
  { name: 'visited', detail: 'Visited link state' },
  { name: 'focus-visible', detail: 'Focus visible (keyboard)' },
  { name: 'focus-within', detail: 'Focus within container' },
  { name: 'first-child', detail: 'First child element' },
  { name: 'last-child', detail: 'Last child element' },
  { name: 'nth-child(n)', detail: 'Nth child element' },
  { name: 'odd', detail: '2Nth+1 child element' },
  { name: 'even', detail: '2Nth child element' },
  { name: 'first-of-type', detail: 'First of its type' },
  { name: 'last-of-type', detail: 'Last of its type' },
  { name: 'only-child', detail: 'Only child element' },
  { name: 'only-of-type', detail: 'Only element of its type' },
  { name: 'enabled', detail: 'Enabled form element' },
  { name: 'disabled', detail: 'Disabled form element' },
  { name: 'checked', detail: 'Checked input' },
  { name: 'required', detail: 'Required form field' },
  { name: 'optional', detail: 'Optional form field' },
  { name: 'valid', detail: 'Valid form field' },
  { name: 'invalid', detail: 'Invalid form field' },
  { name: 'empty', detail: 'Empty element' },
  { name: 'target', detail: 'Target of URL fragment' },
  { name: ':before', detail: 'Before pseudo-element' },
  { name: ':after', detail: 'After pseudo-element' },
  { name: ':placeholder', detail: 'Placeholder text' },
  { name: 'placeholder-shown', detail: 'Placeholder visible' },
  { name: 'autofill', detail: 'Autofilled input' },
  { name: 'read-only', detail: 'Read-only element' },
  { name: 'read-write', detail: 'Editable element' },
];

const colDirs = ['t', 'c', 'b'];
const rowDirs = ['l', 'c', 'r'];
const predefinedFlexDirs = colDirs
  .map((cd) => rowDirs.map((rd) => `${cd}${rd}`))
  .flat();
export const CSS_OPTIONS = {
  display: [
    'block',
    'inline',
    'inline-block',
    'flex',
    'inline-flex',
    'grid',
    'inline-grid',
    'none',
    'contents',
    'table',
    'list-item',
  ],

  position: ['static', 'relative', 'absolute', 'fixed', 'sticky'],

  visibility: ['visible', 'hidden', 'collapse'],

  overflow: ['visible', 'hidden', 'scroll', 'auto', 'clip'],
  overflowX: ['visible', 'hidden', 'scroll', 'auto', 'clip'],
  overflowY: ['visible', 'hidden', 'scroll', 'auto', 'clip'],

  flexDirection: ['row', 'row-reverse', 'column', 'column-reverse'],
  flexWrap: ['nowrap', 'wrap', 'wrap-reverse'],

  justifyContent: [
    'flex-start',
    'flex-end',
    'center',
    'space-between',
    'space-around',
    'space-evenly',
    'start',
    'end',
    'left',
    'right',
  ],

  alignItems: [
    'stretch',
    'flex-start',
    'flex-end',
    'center',
    'baseline',
    'first baseline',
    'last baseline',
    'start',
    'end',
  ],

  alignContent: [
    'flex-start',
    'flex-end',
    'center',
    'space-between',
    'space-around',
    'space-evenly',
    'stretch',
    'start',
    'end',
  ],

  alignSelf: [
    'auto',
    'flex-start',
    'flex-end',
    'center',
    'baseline',
    'stretch',
  ],

  boxSizing: ['content-box', 'border-box'],

  borderStyle: [
    'none',
    'hidden',
    'dotted',
    'dashed',
    'solid',
    'double',
    'groove',
    'ridge',
    'inset',
    'outset',
  ],

  cursor: [
    'auto',
    'default',
    'pointer',
    'wait',
    'text',
    'move',
    'help',
    'not-allowed',
    'grab',
    'grabbing',
    'crosshair',
    'zoom-in',
    'zoom-out',
  ],

  textAlign: ['left', 'right', 'center', 'justify', 'start', 'end'],

  textTransform: ['none', 'capitalize', 'uppercase', 'lowercase'],

  fontWeight: [
    'normal',
    'bold',
    'bolder',
    'lighter',
    '100',
    '200',
    '300',
    '400',
    '500',
    '600',
    '700',
    '800',
    '900',
  ],

  fontStyle: ['normal', 'italic', 'oblique'],

  listStyleType: [
    'disc',
    'circle',
    'square',
    'decimal',
    'lower-roman',
    'upper-roman',
    'lower-alpha',
    'upper-alpha',
    'none',
  ],

  objectFit: ['fill', 'contain', 'cover', 'none', 'scale-down'],

  pointerEvents: [
    'auto',
    'none',
    'visiblePainted',
    'visibleFill',
    'visibleStroke',
    'visible',
    'painted',
    'fill',
    'stroke',
    'all',
  ],

  whiteSpace: [
    'normal',
    'nowrap',
    'pre',
    'pre-wrap',
    'pre-line',
    'break-spaces',
  ],

  wordBreak: ['normal', 'break-all', 'keep-all', 'break-word'],

  float: ['left', 'right', 'none', 'inline-start', 'inline-end'],

  clear: ['none', 'left', 'right', 'both', 'inline-start', 'inline-end'],

  // New additions
  backgroundSize: ['auto', 'cover', 'contain'],

  backgroundRepeat: [
    'repeat',
    'no-repeat',
    'repeat-x',
    'repeat-y',
    'round',
    'space',
  ],

  backgroundPosition: [
    'top',
    'bottom',
    'left',
    'right',
    'center',
    'top left',
    'top right',
    'bottom left',
    'bottom right',
  ],

  textDecoration: ['none', 'underline', 'overline', 'line-through'],

  textOverflow: ['clip', 'ellipsis'],

  transitionTimingFunction: [
    'ease',
    'ease-in',
    'ease-out',
    'ease-in-out',
    'linear',
    'step-start',
    'step-end',
  ],

  transformOrigin: [
    'center',
    'top',
    'bottom',
    'left',
    'right',
    'top left',
    'top right',
    'bottom left',
    'bottom right',
  ],

  aspectRatio: ['auto', '1/1', '4/3', '16/9', '21/9', '3/2'],

  gridAutoFlow: ['row', 'column', 'dense', 'row dense', 'column dense'],

  placeItems: ['start', 'end', 'center', 'stretch'],

  placeContent: [
    'start',
    'end',
    'center',
    'stretch',
    'space-between',
    'space-around',
    'space-evenly',
  ],

  opacity: ['0', '0.25', '0.5', '0.75', '1'],
  fxcol: predefinedFlexDirs,
  fxrow: predefinedFlexDirs,
  zIndex: ['auto', '0', '10', '20', '30', '40', '50', '100'],
} as Record<string, Array<string>>;

export const DEFAULT_CSS_VALUES = [
  'initial',
  'inherit',
  'unset',
  'revert',
  'revert-layer',
];
