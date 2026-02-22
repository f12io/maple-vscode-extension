import { ParsedClass } from '@f12io/maple';
import { CompletionItem, Range } from 'vscode';
import { createValueCompletionsForDefault } from './create-value-completions-for-default';
import { createValueCompletionsForPredefined } from './create-value-completions-for-predefined';
import { createValueCompletionsForNumber } from './create-value-completions-for-number';
import { createValueCompletionsForColor } from './create-value-completions-for-color';

export function createValueCompletions(
  parsed: Partial<ParsedClass> | undefined,
  range: Range,
): CompletionItem[] {
  const items: CompletionItem[] = [];
  items.push(...createValueCompletionsForPredefined(parsed, range));
  items.push(...createValueCompletionsForNumber(parsed, range));
  items.push(...createValueCompletionsForDefault(parsed, range));
  items.push(...createValueCompletionsForColor(parsed, range));
  return items;
}
