import { ParsedClass } from '@f12io/maple';
import { CompletionItem, CompletionItemKind, Range } from 'vscode';
import { DEFAULT_CSS_VALUES } from '../constants';
import { matchesPrefix } from './matches-prefix';
import { getUtilKey } from './get-util-key';
import { CompletionItemLabelDetails } from 'vscode-languageclient';

export function createValueCompletionsForDefault(
  parsed: Partial<ParsedClass> | undefined,
  range: Range,
): CompletionItem[] {
  const items: CompletionItem[] = [];
  if (!parsed) {
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
  for (let value of DEFAULT_CSS_VALUES) {
    if (matchesPrefix(value, utilVal)) {
      const val = `${prefix}${value}`;
      const item = new CompletionItem(val, CompletionItemKind.EnumMember);
      item.range = range;
      item.sortText = `9-${value}`;
      items.push(item);
    }
  }
  return items;
}
