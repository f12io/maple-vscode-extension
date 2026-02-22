import { ParsedClass } from '@f12io/maple';
import {
  CompletionItem,
  CompletionItemKind,
  MarkdownString,
  Range,
  SnippetString,
} from 'vscode';
import { getUtilKey } from './get-util-key';
import {
  BREAKPOINTS,
  CUSTOM_MEDIA_QUERIES,
  VIEWPORT_QUERIES,
} from '../constants';
import { matchesPrefix } from './matches-prefix';

/**
 * Create completion items for media queries
 */
export function createMediaQueryCompletions(
  parsed: Partial<ParsedClass> | undefined,
  range: Range,
): CompletionItem[] {
  const items: CompletionItem[] = [];
  if (!parsed) {
    return [];
  }
  const utilKey = getUtilKey(parsed);
  if (utilKey === null) {
    return [];
  }
  const hasAt = utilKey.startsWith('@');
  const searchKey = hasAt ? utilKey.replace('@', '') : utilKey;
  const indexOfUtilKey = parsed.srcClass?.lastIndexOf(utilKey) || 0;
  const prefix = parsed.srcClass?.slice(0, indexOfUtilKey) || '';
  // Add breakpoint completions
  for (const bp of BREAKPOINTS) {
    if (matchesPrefix(bp.name, searchKey)) {
      const val = `${prefix}${hasAt ? '@' : ''}${bp.name}:`;
      const item = new CompletionItem(val, CompletionItemKind.Module);
      item.detail = bp.detail;
      item.documentation = new MarkdownString(
        `**${bp.name}** (min-width: ${bp.value})\n\n${bp.detail}\n\nExample: \`${bp.name}:p-4\``,
      );
      item.insertText = new SnippetString(val);
      item.range = range;
      item.command = {
        command: 'editor.action.triggerSuggest',
        title: '',
      };
      item.sortText = `0-${bp.name}`;
      items.push(item);
    }
  }

  if (hasAt) {
    // Add viewport/media query completions
    for (const mq of VIEWPORT_QUERIES) {
      const mqName = mq.name.slice(1);
      if (matchesPrefix(mqName, searchKey) || matchesPrefix(mq.name, prefix)) {
        const val = mq.name + ':';
        const item = new CompletionItem(val, CompletionItemKind.Module);
        item.detail = mq.detail;
        item.documentation = new MarkdownString(
          `**${mq.name}**\n\n${mq.detail}\n\nExample: \`${mq.name}:bgc-black\``,
        );
        item.insertText = new SnippetString(val);
        item.range = range;
        item.detail = mq.detail;
        item.command = {
          command: 'editor.action.triggerSuggest',
          title: '',
        };
        item.sortText = `1-${mq.name}`;
        items.push(item);
      }
    }
  }

  // Add custom media query completions
  for (const cmq of CUSTOM_MEDIA_QUERIES) {
    if (matchesPrefix(cmq.name, searchKey)) {
      const val = `${hasAt ? '@' : ''}${cmq.name}`;
      const item = new CompletionItem(val, CompletionItemKind.Module);
      item.detail = cmq.detail;
      item.documentation = new MarkdownString(
        `**${cmq.name}**\n\n${cmq.detail}\n\nExample: \`${cmq.name}:bgc-black\``,
      );
      item.insertText = new SnippetString(val);
      item.range = range;
      item.command = {
        command: 'editor.action.triggerSuggest',
        title: '',
      };
      item.sortText = `2-${cmq.name}`;
      items.push(item);
    }
  }
  return items;
}
