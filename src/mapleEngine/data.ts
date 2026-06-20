import { ABBREVIATIONS, BUILTIN_ALIASES } from "@f12io/maple";

export { ABBREVIATIONS, BUILTIN_ALIASES };

export const PSEUDO_CLASSES = [
  "hover",
  "focus",
  "active",
  "visited",
  "focus-within",
  "focus-visible",
  "disabled",
  "checked",
  "first-child",
  "last-child",
  "nth-child(even)",
  "nth-child(odd)",
  "before",
  "after",
];



export const PREDEFINED_VARIABLES = [
  { name: "--l-scale", description: "Lightness Scale Chain (e.g., 0.2)" },
  { name: "--l-shift", description: "Lightness Shift Chain (e.g., 0.5)" },
  { name: "--c-scale", description: "Chroma Scale Chain (e.g., 1.5)" },
  { name: "--h-rotate", description: "Hue Rotate Chain (e.g., 90deg)" },
  {
    name: "--l-edge-shift",
    description:
      "Dampening curve of lightness scaling toward extremes (default: 0.5)",
  },
  {
    name: "--c-curve",
    description:
      "Curve of the chroma reduction for extreme tones (default: 0.5)",
  },
  { name: "--spacer", description: "Global spacer multiplier (default: 0.25)" },
];

export const POPULAR_ABBREVIATIONS = [
  "d",
  "p",
  "m",
  "w",
  "h",
  "c",
  "bgc",
  "fx",
  "gr",
  "g",
  "jc",
  "ai",
  "fxdir",
  "pos",
  "t",
  "r",
  "b",
  "l",
  "z",
  "fs",
  "fw",
  "ta",
  "rad",
  "of",
  "o",
  "square",
];

const colDirs = ["t", "c", "b"];
const rowDirs = ["l", "c", "r"];
const predefinedFlexDirs = colDirs
  .map((cd) => rowDirs.map((rd) => `${cd}${rd}`))
  .flat();

export const CSS_OPTIONS: Record<string, Array<string>> = {
  display: [
    "block",
    "inline",
    "inline-block",
    "flex",
    "inline-flex",
    "grid",
    "inline-grid",
    "none",
    "contents",
    "table",
    "list-item",
  ],

  position: ["static", "relative", "absolute", "fixed", "sticky"],

  visibility: ["visible", "hidden", "collapse"],

  overflow: ["visible", "hidden", "scroll", "auto", "clip"],
  overflowX: ["visible", "hidden", "scroll", "auto", "clip"],
  overflowY: ["visible", "hidden", "scroll", "auto", "clip"],

  flexDirection: ["row", "row-reverse", "column", "column-reverse"],
  flexWrap: ["nowrap", "wrap", "wrap-reverse"],

  justifyContent: [
    "flex-start",
    "flex-end",
    "center",
    "space-between",
    "space-around",
    "space-evenly",
    "start",
    "end",
    "left",
    "right",
  ],

  alignItems: [
    "stretch",
    "flex-start",
    "flex-end",
    "center",
    "baseline",
    "first baseline",
    "last baseline",
    "start",
    "end",
  ],

  alignContent: [
    "flex-start",
    "flex-end",
    "center",
    "space-between",
    "space-around",
    "space-evenly",
    "stretch",
    "start",
    "end",
  ],

  alignSelf: [
    "auto",
    "flex-start",
    "flex-end",
    "center",
    "baseline",
    "stretch",
  ],

  boxSizing: ["content-box", "border-box"],

  borderStyle: [
    "none",
    "hidden",
    "dotted",
    "dashed",
    "solid",
    "double",
    "groove",
    "ridge",
    "inset",
    "outset",
  ],

  cursor: [
    "auto",
    "default",
    "pointer",
    "wait",
    "text",
    "move",
    "help",
    "not-allowed",
    "grab",
    "grabbing",
    "crosshair",
    "zoom-in",
    "zoom-out",
  ],

  textAlign: ["left", "right", "center", "justify", "start", "end"],

  textTransform: ["none", "capitalize", "uppercase", "lowercase"],

  fontWeight: [
    "normal",
    "bold",
    "bolder",
    "lighter",
    "100",
    "200",
    "300",
    "400",
    "500",
    "600",
    "700",
    "800",
    "900",
  ],

  fontStyle: ["normal", "italic", "oblique"],

  listStyleType: [
    "disc",
    "circle",
    "square",
    "decimal",
    "lower-roman",
    "upper-roman",
    "lower-alpha",
    "upper-alpha",
    "none",
  ],

  objectFit: ["fill", "contain", "cover", "none", "scale-down"],

  pointerEvents: [
    "auto",
    "none",
    "visiblePainted",
    "visibleFill",
    "visibleStroke",
    "visible",
    "painted",
    "fill",
    "stroke",
    "all",
  ],

  whiteSpace: [
    "normal",
    "nowrap",
    "pre",
    "pre-wrap",
    "pre-line",
    "break-spaces",
  ],

  wordBreak: ["normal", "break-all", "keep-all", "break-word"],

  float: ["left", "right", "none", "inline-start", "inline-end"],

  clear: ["none", "left", "right", "both", "inline-start", "inline-end"],

  backgroundSize: ["auto", "cover", "contain"],

  backgroundRepeat: [
    "repeat",
    "no-repeat",
    "repeat-x",
    "repeat-y",
    "round",
    "space",
  ],

  backgroundPosition: [
    "top",
    "bottom",
    "left",
    "right",
    "center",
    "top left",
    "top right",
    "bottom left",
    "bottom right",
  ],

  textDecoration: ["none", "underline", "overline", "line-through"],

  textOverflow: ["clip", "ellipsis"],

  transitionTimingFunction: [
    "ease",
    "ease-in",
    "ease-out",
    "ease-in-out",
    "linear",
    "step-start",
    "step-end",
  ],

  transformOrigin: [
    "center",
    "top",
    "bottom",
    "left",
    "right",
    "top left",
    "top right",
    "bottom left",
    "bottom right",
  ],

  aspectRatio: ["auto", "1/1", "4/3", "16/9", "21/9", "3/2"],

  gridAutoFlow: ["row", "column", "dense", "row dense", "column dense"],

  placeItems: ["start", "end", "center", "stretch"],

  placeContent: [
    "start",
    "end",
    "center",
    "stretch",
    "space-between",
    "space-around",
    "space-evenly",
  ],

  opacity: ["0", "0.25", "0.5", "0.75", "1"],
  fxcol: predefinedFlexDirs,
  fxrow: predefinedFlexDirs,
  zIndex: ["auto", "0", "10", "20", "30", "40", "50", "100"],
};

export const DEFAULT_CSS_VALUES = [
  "initial",
  "inherit",
  "unset",
  "revert",
  "revert-layer",
];



export const GRADIENT_DIRECTIONS = [
  "to_top",
  "to_right",
  "to_bottom",
  "to_left",
  "to_top_right",
  "to_top_left",
  "to_bottom_right",
  "to_bottom_left",
];

export const MULTI_VALUE_REGEX =
  /shadow|margin|padding|border|gap|inset|transition$|animation$|gridTemplate/i;
