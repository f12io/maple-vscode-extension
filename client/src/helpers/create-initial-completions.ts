import { ParsedClass } from '@f12io/maple';
import { CompletionItem, MarkdownString, Range, SnippetString } from 'vscode';
import { POPULAR_ABBREVIATIONS, SHORTCUTS } from '../constants';
import { CompletionItemKind } from 'vscode-languageclient';
import { createMediaQueryCompletions } from './create-media-query-completions';
import { PRECALCULATED_PROP_ABBREVIATIONS } from '@/shared/constants';

export function createInitialCompletions(
  parsed: Partial<ParsedClass> | undefined,
  range: Range,
): CompletionItem[] {
  const items: CompletionItem[] = [];
  let sortIndex = 0;
  // Calculate the start of the current word "mt"
  if (!parsed) {
    return [];
  }
  // Add only popular abbreviations
  for (const abbr of POPULAR_ABBREVIATIONS) {
    const fullName = PRECALCULATED_PROP_ABBREVIATIONS[abbr];
    if (fullName) {
      const val = `${abbr}-`;
      const item: CompletionItem = new CompletionItem(
        val,
        CompletionItemKind.Property,
      );
      item.detail = `${fullName} (abbreviation)`;
      item.documentation = new MarkdownString(
        `**${abbr}** → \`${fullName}\`\n\nMaple property abbreviation`,
      );
      item.range = range;
      item.command = {
        command: 'editor.action.triggerSuggest',
        title: '',
      };
      item.insertText = new SnippetString(val);
      item.sortText = '0-' + val.padStart(9, '0');
      items.push(item);
    }
  }
  // Add shortcuts
  for (const [key, cssValue] of Object.entries(SHORTCUTS)) {
    const item: CompletionItem = new CompletionItem(
      key,
      CompletionItemKind.Property,
    );
    item.detail = cssValue;
    item.documentation = new MarkdownString(
      `**${key}** → \`${cssValue}\`\n\nMaple property abbreviation`,
    );
    item.insertText = new SnippetString(key);
    item.range = range;
    item.sortText = '0-' + key.padStart(9, '0');
    items.push(item);
  }
  // Add self selector
  const selfItem: CompletionItem = new CompletionItem(
    '&:',
    CompletionItemKind.Operator,
  );
  selfItem.detail = 'Self selector';
  selfItem.documentation = new MarkdownString(
    'Target self with modifier\n\nExample: `&:hover:bgc-blue`',
  );
  selfItem.range = range;
  selfItem.insertText = '&:';
  selfItem.sortText = '1-' + '&:'.padStart(9, '0');
  selfItem.command = {
    command: 'editor.action.triggerSuggest',
    title: '',
  };
  items.push(selfItem);
  const mediaItems = createMediaQueryCompletions(parsed, range);
  return [...items, ...mediaItems];
}
