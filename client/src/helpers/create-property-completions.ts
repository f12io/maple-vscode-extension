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
  BACKDROP_FILTER_KEYS,
  FILTER_KEYS,
  FLEX_LAYOUT,
  SHORTCUTS,
  TRANSFORM_KEYS,
} from '../constants';
import { matchesPrefix } from './matches-prefix';
import { camelToKebab } from './string-helpers';
import { PRECALCULATED_PROP_ABBREVIATIONS } from '@/shared/constants';

export function createPropertyCompletions(
  parsed: Partial<ParsedClass> | undefined,
  range: Range,
): CompletionItem[] {
  if (!parsed) {
    return [];
  }
  const items: CompletionItem[] = [];
  const seen = new Set<string>();
  const utilKey = getUtilKey(parsed);
  if (utilKey === null) {
    return [];
  }
  const indexOfUtilKey = Math.max(
    parsed.srcClass?.lastIndexOf(utilKey) || 0,
    0,
  );
  const prefix = parsed.srcClass?.slice(0, indexOfUtilKey) || '';

  // Add shortcuts FOURTH
  for (const [key, cssValue] of Object.entries(SHORTCUTS)) {
    if (matchesPrefix(key, utilKey) && !seen.has(key)) {
      seen.add(key);
      const val = `${prefix}${key}`;
      const item: CompletionItem = new CompletionItem(
        val,
        CompletionItemKind.Snippet,
      );
      item.detail = cssValue;
      item.documentation = new MarkdownString(
        `**${key}** → \`${cssValue}\`\n\nMaple shortcut`,
      );
      item.range = range;
      item.insertText = new SnippetString(val);
      item.sortText = `3-${key}`;
      items.push(item);
    }
  }

  // Add Flex Layout keys
  for (const [key, fullName] of Object.entries(FLEX_LAYOUT)) {
    if (matchesPrefix(key, utilKey) && !seen.has(key)) {
      seen.add(key);
      const val = `${prefix}${key}`;
      const item = new CompletionItem(val, CompletionItemKind.Function);
      item.detail = `${fullName} (Layout)`;
      item.documentation = new MarkdownString(`**${key}** → \`${fullName}\`\n`);
      item.insertText = new SnippetString(val);
      item.range = range;
      item.sortText = `0-${key}`;
      items.push(item);
    }
  }

  for (const [abbr, fullName] of Object.entries(
    PRECALCULATED_PROP_ABBREVIATIONS,
  ) as Array<[string, string]>) {
    // Add abbreviation-based completions FIRST
    if (matchesPrefix(abbr, utilKey) && !seen.has(abbr)) {
      seen.add(abbr);
      const val = `${prefix}${abbr}-`;
      const item = new CompletionItem(val, CompletionItemKind.Property);
      item.detail = `${fullName} (abbreviation)`;
      item.documentation = new MarkdownString(
        `**${abbr}** → \`${fullName}\`\n\nMaple property abbreviation`,
      );
      item.range = range;
      item.insertText = new SnippetString(`${val}$1`);
      item.command = {
        command: 'editor.action.triggerSuggest',
        title: '',
      };
      item.sortText = `0-${abbr.padStart(10, '0')}`;
      items.push(item);
    }
    // Add camelCase versions SECOND
    if (matchesPrefix(fullName, utilKey) && !seen.has(fullName)) {
      seen.add(fullName);
      const val = `${prefix}${fullName}-`;
      const item = new CompletionItem(val, CompletionItemKind.Property);
      item.detail = `${fullName} (camelCase)`;
      item.documentation = new MarkdownString(
        `**${fullName}** (camelCase)\n\nAlias for: \`${abbr}\``,
      );
      item.range = range;
      item.insertText = new SnippetString(`${val}$1`);
      item.command = {
        command: 'editor.action.triggerSuggest',
        title: '',
      };
      item.sortText = `1-${fullName}`;
      items.push(item);
    }

    // Add kebab-case versions THIRD
    const kebab = camelToKebab(fullName);
    if (
      kebab !== fullName &&
      matchesPrefix(kebab, utilKey) &&
      !seen.has(kebab)
    ) {
      seen.add(kebab);
      const val = `${prefix}${kebab}-`;
      const item = new CompletionItem(val, CompletionItemKind.Property);
      item.detail = `${kebab} (kebab-case)`;
      item.documentation = new MarkdownString(
        `**${kebab}** (kebab-case)\n\nAlias for: \`${abbr}\``,
      );
      item.range = range;
      item.insertText = new SnippetString(`${val}$1`);
      item.command = {
        command: 'editor.action.triggerSuggest',
        title: '',
      };
      item.sortText = `2-${kebab}`;
      items.push(item);
    }
  }

  // Add transform keys
  for (const [key, fullName] of Object.entries(TRANSFORM_KEYS)) {
    if (matchesPrefix(key, utilKey) && !seen.has(key)) {
      seen.add(key);
      const val = `${prefix}${key}-`;
      const item = new CompletionItem(val, CompletionItemKind.Function);
      item.detail = `${fullName} (transform)`;
      item.documentation = new MarkdownString(
        `**${key}** → \`${fullName}\`\n\nTransform function`,
      );
      item.range = range;
      item.insertText = new SnippetString(`${val}$1`);
      item.command = {
        command: 'editor.action.triggerSuggest',
        title: '',
      };
      item.sortText = `4-${key}`;
      items.push(item);
    }
  }

  // Add filter keys
  for (const [key, fullName] of Object.entries(FILTER_KEYS)) {
    if (matchesPrefix(key, utilKey) && !seen.has(key)) {
      seen.add(key);
      const val = `${prefix}${key}-`;
      const item = new CompletionItem(val, CompletionItemKind.Function);
      item.detail = `${fullName} (filter)`;
      item.documentation = new MarkdownString(
        `**${key}** → \`${fullName}\`\n\nFilter function`,
      );
      item.range = range;
      item.insertText = new SnippetString(`${val}$1`);
      item.command = {
        command: 'editor.action.triggerSuggest',
        title: '',
      };
      item.sortText = `5-${key}`;
      items.push(item);
    }
  }

  // Add backdrop filter keys
  for (const [key, fullName] of Object.entries(BACKDROP_FILTER_KEYS)) {
    if (matchesPrefix(key, utilKey) && !seen.has(key)) {
      seen.add(key);
      const val = `${prefix}${key}-`;
      const item = new CompletionItem(val, CompletionItemKind.Function);

      item.detail = `${fullName} (backdrop-filter)`;
      item.documentation = new MarkdownString(
        `**${key}** → \`backdrop-filter: ${fullName}\``,
      );
      item.range = range;
      item.insertText = new SnippetString(`${val}$1`);
      item.command = {
        command: 'editor.action.triggerSuggest',
        title: '',
      };
      item.sortText = `6-${key}`;
      items.push(item);
    }
  }

  return items;
}
