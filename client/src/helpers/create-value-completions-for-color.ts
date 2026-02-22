import { ParsedClass } from '@f12io/maple';
import { CompletionItem, CompletionItemKind, Range } from 'vscode';
import { getUtilKey } from './get-util-key';
import { namedColors } from '@f12io/coco';
import { matchesPrefix } from './matches-prefix';
import { GRADIENT_KEYS } from '../constants';

export function createValueCompletionsForColor(
  parsed: Partial<ParsedClass> | undefined,
  range: Range,
): CompletionItem[] {
  const items: CompletionItem[] = [];
  if (!parsed) {
    return items;
  }
  const propType = parsed.propType;
  if (propType !== 2) {
    return items;
  }
  const utilVal = parsed.utilVal || '';
  const utilOp = parsed.utilOp || '-';
  const utilKey = getUtilKey(parsed);
  const splitter = `${utilKey}${utilOp}`;
  const indexOfUtil = Math.max(parsed.srcClass?.lastIndexOf(splitter) || 0, 0);
  const lastFcnSeparator = utilVal.lastIndexOf('|');
  const prefix = (parsed.srcClass || '').slice(
    0,
    indexOfUtil + splitter.length + lastFcnSeparator + 1,
  );
  const val = utilVal.slice(lastFcnSeparator + 1);
  const colorNames = generateColorNames(prefix, val, range);
  items.push(...colorNames);
  const colorFcns = generateColorFunctions(
    prefix,
    utilKey,
    val,
    lastFcnSeparator,
    range,
  );
  items.push(...colorFcns);
  const colorTones = generateColorTones(prefix, val, range);
  items.push(...colorTones);
  const colorOpacities = generateColorOpacities(prefix, val, range);
  items.push(...colorOpacities);
  return items;
}

function generateColorNames(prefix: string, val: string, range: Range) {
  const items: CompletionItem[] = [];
  const colors = Object.keys(namedColors);
  for (const color of colors) {
    if (matchesPrefix(color, val)) {
      const item = new CompletionItem(
        `${prefix}${color}`,
        CompletionItemKind.Color,
      );
      item.detail = `Color: ${color}`;
      item.insertText = `${prefix}${color}`;
      item.range = range;
      item.sortText = `2-${color}`;
      items.push(item);
    }
  }
  return items;
}

function generateColorFunctions(
  prefix: string,
  utilKey: string,
  val: string,
  lastFcnSeparator: number,
  range: Range,
) {
  const items: CompletionItem[] = [];
  if (['bg', 'bgimg'].some((key) => utilKey === key) && lastFcnSeparator < 0) {
    for (let [key, fullName] of Object.entries(GRADIENT_KEYS)) {
      if (matchesPrefix(key, val)) {
        const item = new CompletionItem(
          `${prefix}${key}|`,
          CompletionItemKind.Function,
        );
        item.detail = `Function: ${fullName}`;
        item.insertText = `${prefix}${key}|`;
        item.range = range;
        item.sortText = `1-${key}`;
        item.command = {
          command: 'editor.action.triggerSuggest',
          title: '',
        };
        items.push(item);
      }
    }
  }
  return items;
}

function generateColorTones(prefix: string, val: string, range: Range) {
  const items: CompletionItem[] = [];
  if (val.includes('-')) {
    const [cName, tone] = val.split('-');
    const toneNum = parseInt(tone);
    if (!isNaN(toneNum) && toneNum < 100) {
      items.push(
        ...new Array(11).fill(1).map((_, i) => {
          const variant =
            toneNum * Math.pow(10, Math.max(0, 3 - tone.length)) +
            i * Math.pow(10, Math.max(0, 3 - tone.length - 1));
          const val = `${prefix}${cName}-${variant}`;
          const item = new CompletionItem(val, CompletionItemKind.Color);
          item.detail = `Color Tone: ${variant}`;
          item.insertText = val;
          item.range = range;
          item.sortText = `3-${String(variant).padStart(5, '0')}`;
          return item;
        }),
      );
    }
    if (isNaN(toneNum) && tone.length < 1) {
      items.push(
        ...new Array(20).fill(1).map((_, i) => {
          const item = new CompletionItem(
            `${prefix}${val}${i * 50}`,
            CompletionItemKind.Color,
          );
          item.insertText = `${prefix}${val}${i * 50}`;
          item.detail = `Color Tone: ${i * 50}`;
          item.range = range;
          item.sortText = `3-${String(i * 50).padStart(5, '0')}`;
          return item;
        }),
      );
    }
  }
  return items;
}

function generateColorOpacities(prefix: string, val: string, range: Range) {
  const items: CompletionItem[] = [];
  if (val.includes('/')) {
    const [colorAndTone, opacity] = val.split('/');
    const op = parseInt(opacity);
    if (!isNaN(op) && op < 10) {
      items.push(
        ...new Array(11).fill(1).map((_, i) => {
          const variant =
            op * Math.pow(10, Math.max(0, 2 - opacity.length)) +
            i * Math.pow(10, Math.max(0, 2 - opacity.length - 1));
          const val = `${prefix}${colorAndTone}/${variant}`;
          const item = new CompletionItem(val, CompletionItemKind.Color);
          item.detail = `Opacity: ${variant}%`;
          item.insertText = val;
          item.range = range;
          item.sortText = `3-${String(variant).padStart(5, '0')}`;
          return item;
        }),
      );
    }
    if (isNaN(op) && opacity.length < 1) {
      items.push(
        ...new Array(20).fill(1).map((_, i) => {
          const item = new CompletionItem(
            `${prefix}${val}${i * 5}`,
            CompletionItemKind.Color,
          );
          item.detail = `Opacity: ${i * 5}%`;
          item.insertText = `${prefix}${val}${i * 5}`;
          item.range = range;
          item.sortText = `3-${String(i * 5).padStart(5, '0')}`;
          return item;
        }),
      );
    }
  }
  return items;
}
