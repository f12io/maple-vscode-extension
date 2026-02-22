import {
  DEFAULT_ANGLE_UNIT,
  DEFAULT_TIME_UNIT,
  DEFAULT_LENGTH_UNIT,
  ANGLE_REGEX,
  TIME_REGEX,
  UNITLESS_REGEX,
  MULTI_VALUE_REGEX,
  COLOR_REGEX,
} from './constants';

export function getUnitForProperty(
  propName: string,
):
  | ''
  | null
  | typeof DEFAULT_ANGLE_UNIT
  | typeof DEFAULT_TIME_UNIT
  | typeof DEFAULT_LENGTH_UNIT {
  if (UNITLESS_REGEX.test(propName)) return '';
  if (ANGLE_REGEX.test(propName)) return DEFAULT_ANGLE_UNIT;
  if (TIME_REGEX.test(propName)) return DEFAULT_TIME_UNIT;
  if (MULTI_VALUE_REGEX.test(propName) || COLOR_REGEX.test(propName))
    return null;

  // Default for everything else (margins, padding, width, height, etc.)
  return DEFAULT_LENGTH_UNIT;
}
