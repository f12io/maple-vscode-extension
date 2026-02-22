import { ParsedClass } from '@f12io/maple';
import {
  CompletionItem,
  CompletionItemKind,
  CompletionItemTag,
  Range,
} from 'vscode';
import { getUtilKey } from './get-util-key';
import { CSS_OPTIONS } from '../constants';
import { matchesPrefix } from './matches-prefix';

export function createValueCompletionsForPredefined(
  parsed: Partial<ParsedClass> | undefined,
  range: Range,
): CompletionItem[] {
  const items: CompletionItem[] = [];
  if (!parsed) {
    return items;
  }
  const fullProp = parsed.propKeyKebab || '';
  const options = CSS_OPTIONS[fullProp];
  if (!options) {
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
  if (options) {
    let sortIndex = 0;
    for (const value of options) {
      if (matchesPrefix(value, utilVal)) {
        const item = new CompletionItem(
          `${prefix}${value}`,
          CompletionItemKind.EnumMember,
        );

        item.detail = `${prefix}${value}`;
        item.insertText = `${prefix}${value}`;
        item.range = range;
        item.sortText = `0-${String(sortIndex++).padStart(10, '0')}`;
        items.push(item);
      }
    }
  }
  return items;
}
