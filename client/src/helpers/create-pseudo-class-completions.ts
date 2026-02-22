import { ParsedClass } from '@f12io/maple';
import {
  CompletionItem,
  CompletionItemKind,
  MarkdownString,
  Range,
  SnippetString,
} from 'vscode';
import { getUtilKey } from './get-util-key';
import { PSEUDO_CLASSES } from '../constants';
import { matchesPrefix } from './matches-prefix';

export function createPseudoClassCompletions(
  parsed: Partial<ParsedClass> | undefined,
  range: Range,
): CompletionItem[] {
  if (!parsed) {
    return [];
  }
  const items: CompletionItem[] = [];
  const utilKey = getUtilKey(parsed);
  if (utilKey === null) {
    return items;
  }
  const indexOfUtilKey = parsed.srcClass?.lastIndexOf(utilKey) || 0;
  const prefix = parsed.srcClass?.slice(0, indexOfUtilKey) || '&:';
  for (const pseudo of PSEUDO_CLASSES) {
    if (matchesPrefix(pseudo.name, utilKey) || utilKey === '') {
      const val = `${prefix}${pseudo.name}:`;
      const item: CompletionItem = new CompletionItem(
        val,
        CompletionItemKind.Keyword,
      );
      item.detail = `${pseudo.detail}`;
      item.documentation = new MarkdownString(
        `**${pseudo.name}**\n\n${pseudo.detail}\n\nExample: \`&${pseudo.name}:bgc-red\``,
      );
      item.range = range;
      item.insertText = new SnippetString(`${prefix}${pseudo.name}:$1`);
      item.command = {
        command: 'editor.action.triggerSuggest',
        title: '',
      };
      item.sortText = `0-${pseudo.name}`;
      items.push(item);
    }
  }
  return items;
}
