import { PRECALCULATED_PROP_ABBREVIATIONS as abbr } from '@f12io/maple';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(
  '',
);
const NUMBERS = '0123456789'.split('');

export const TRIGGER_CHARS = [
  ...ALPHABET,
  ...NUMBERS,
  ' ',
  '"',
  "'",
  ' ',
  '.',
  '-',
  '=',
  ':',
  '{',
  '[',
  '^',
  '@',
  '/',
  '>',
  '&',
  '|',
];

export const classAttrRegex =
  /(?:class|:class|\[class\]|className)\s*[=:]\s*(["'`])([\s\S]*?)\1/gi;

export const PRECALCULATED_PROP_ABBREVIATIONS: Record<string, string> = {
  ...abbr,
  square: 'square',
};

export const DEFAULT_TIME_UNIT = 'ms' as const;
export const DEFAULT_ANGLE_UNIT = 'deg' as const;
export const DEFAULT_LENGTH_UNIT = 'rem' as const;

// Properties that NEVER take a unit
export const UNITLESS_REGEX =
  /scale|opacity|weight|index|flex|lineHeight|aspectRatio|count|invert|brightness|contrast|grayscale|saturate|sepia/i;

// Properties that take an angle
export const ANGLE_REGEX = /\brot\b|rotate|skew|hue/i;

// Properties that take time
export const TIME_REGEX = /delay|duration|transition|animation/i;
export const MULTI_VALUE_REGEX =
  /shadow|margin|padding|border|gap|inset|transition$|animation$|gridTemplate/i;
export const COLOR_REGEX = /color|fill|stroke|background$|bg$/i; // Matches 'color', 'backgroundColor', 'bg', etc.
