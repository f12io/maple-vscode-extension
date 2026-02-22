import { ParsedClass, PROP_UNIT_MAP, TRANSFORM_KEYS } from '@f12io/maple';
import { CompletionItem, CompletionItemKind, Range } from 'vscode';
import { getUtilKey } from './get-util-key';
import { matchesPrefix } from './matches-prefix';
import {
  DEFAULT_ANGLE_UNIT,
  DEFAULT_LENGTH_UNIT,
  DEFAULT_TIME_UNIT,
} from '@/shared/constants';
import { getUnitForProperty } from '@/shared/get-unit-for-property';

const fractionValues = generateFractionValues();

export function createValueCompletionsForNumber(
  parsed: Partial<ParsedClass> | undefined,
  range: Range,
): CompletionItem[] {
  const items: CompletionItem[] = [];
  if (!parsed) {
    return items;
  }
  const propType = parsed.propType;
  const unit = getUnitForProperty(parsed.propKeyCamel || '');
  if (propType !== 1 && unit === null) {
    return items;
  }
  const utilVal = parsed.utilVal || '';
  const utilOp = parsed.utilOp || '-';
  const utilKey = getUtilKey(parsed);
  const splitter = `${utilKey}${utilOp}`;
  const indexOfUtil = Math.max(parsed.srcClass?.lastIndexOf(splitter) || 0, 0);
  const prefix = (parsed.srcClass || '').slice(
    0,
    indexOfUtil + splitter.length,
  );
  if (unit === DEFAULT_LENGTH_UNIT) {
    const spacingValues = generateSpacingValues(utilVal);
    for (const value of spacingValues) {
      const item = new CompletionItem(
        { label: `${prefix}${value}`, detail: '  (size)' },
        CompletionItemKind.Value,
      );

      item.detail = `${parsed.propKeyCamel}`;
      item.insertText = `${prefix}${value}`;
      item.range = range;
      // Sort numerically
      const numVal = isNaN(parseFloat(value)) ? 999 : parseFloat(value);
      item.sortText = `1-${String(numVal * 100).padStart(6, '0')}`;
      items.push(item);
    }
    items.push(
      ...fractionValues.map((fraction) => {
        const cItem = new CompletionItem({
          label: `${prefix}${fraction.value}`,
          detail: ` (size) ${fraction.percentage}`,
        });
        cItem.detail = `${parsed.propKeyCamel}`;
        cItem.insertText = `${prefix}${fraction.value}`;
        cItem.range = range;
        // Sort numerically

        cItem.sortText = `1-1${fraction.sortIndex}`;
        return cItem;
      }),
    );
  }
  if (unit === DEFAULT_ANGLE_UNIT) {
    const angleValues = generateAngleValues(utilVal);
    for (const value of angleValues) {
      const item = new CompletionItem(
        { label: `${prefix}${value}`, detail: ' (angle)' },
        CompletionItemKind.Value,
      );

      item.detail = `${parsed.propKeyCamel}`;
      item.insertText = `${prefix}${value}`;
      item.range = range;
      // Sort numerically
      const numVal = isNaN(parseFloat(value)) ? 999 : parseFloat(value);
      item.sortText = `1-${String(numVal).padStart(5, '0')}`;
      items.push(item);
    }
  }
  if (unit === DEFAULT_TIME_UNIT) {
    const timeValues = generateTimeValues(utilVal);
    for (const value of timeValues) {
      const item = new CompletionItem(
        { label: `${prefix}${value}`, detail: ' (time)' },
        CompletionItemKind.Value,
      );

      item.detail = `${parsed.propKeyCamel}`;
      item.insertText = `${prefix}${value}`;
      item.range = range;
      // Sort numerically
      const numVal = isNaN(parseInt(value)) ? 999 : parseInt(value);
      item.sortText = `1-${String(numVal).padStart(5, '0')}`;
      items.push(item);
    }
  }
  return items;
}

/**
 * Generate spacing values from 0 to 100, including decimals
 */
function generateSpacingValues(prefix: string): string[] {
  const values: string[] = [];

  // Base values with decimals
  const baseValues = new Array(40).fill(1).map((_, i) => (i * 0.25).toString());
  if (prefix) {
    const baseVal = Math.ceil(parseFloat(prefix));
    if (baseVal >= 10) {
      for (let i = 0; i < 4; i++) {
        baseValues.push(`${baseVal + i * 0.25}`);
      }
    }
    for (let i = 0; i < 40; i++) {
      baseValues.push(`${baseVal * 10 + i * 0.25}`);
    }
  }

  // Add auto
  baseValues.push('auto');
  // Filter by prefix
  for (const val of baseValues) {
    if (matchesPrefix(val, prefix) && !values.includes(val)) {
      values.push(val);
    }
  }

  return values;
}

function generateFractionValues(base: number = 12) {
  const items = [];

  for (let i = 1; i <= base; i++) {
    const reduced = simplifyFraction(i, base);
    const percentage = (i / base) * 100;

    items.push({
      value: reduced,
      sortIndex: `${i}/${base}`.padStart(5, '0'),
      percentage: `${percentage.toFixed(2)}%`,
    });
  }

  return items;
}

/**
 * Reduces a fraction to its lowest terms
 */
function simplifyFraction(numerator: number, denominator: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

  const common = gcd(numerator, denominator);
  const reducedNum = numerator / common;
  const reducedDen = denominator / common;

  // Returns "1/2" instead of "6/12"
  return `${reducedNum}/${reducedDen}`;
}

function generateAngleValues(prefix: string): string[] {
  const numPrefix = parseFloat(prefix);
  if (isNaN(numPrefix)) {
    return new Array(73).fill(1).map((_, i) => `${i * 5}`);
  }
  return numPrefix > 36
    ? [prefix]
    : [
        prefix,
        ...new Array(11).fill(1).map((_, i) => {
          const val = `${numPrefix * 10 + i}`;
          return val;
        }),
      ].filter((item) => parseInt(item) <= 360);
}

function generateTimeValues(prefix: string): string[] {
  const numPrefix = parseFloat(prefix);
  if (isNaN(numPrefix)) {
    return new Array(51).fill(1).map((_, i) => `${i * 100}`);
  }
  return [
    prefix,
    ...(prefix.length < 3
      ? new Array(11).fill(1).map((_, i) => {
          const val = `${
            numPrefix * Math.pow(10, Math.max(0, 3 - prefix.length)) +
            i * Math.pow(10, Math.max(0, 3 - prefix.length - 1))
          }`;
          return val;
        })
      : []),
    ...new Array(11).fill(1).map((_, i) => {
      const val = `${
        numPrefix * Math.pow(10, Math.max(0, 4 - prefix.length)) +
        i * Math.pow(10, Math.max(0, 4 - prefix.length - 1))
      }`;
      return val;
    }),
  ];
}
