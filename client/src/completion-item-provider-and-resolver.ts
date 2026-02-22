import {
  CancellationToken,
  CompletionContext,
  CompletionItem,
  CompletionList,
  MarkdownString,
  Position,
  Range,
  TextDocument,
} from 'vscode';
import { getWordAt } from './helpers/get-word-at';
import {
  CompletionType,
  getCompletionContextType,
} from './helpers/get-completion-context-type';
import { convert, ParsedClass } from '@f12io/maple';
import { createMediaQueryCompletions } from './helpers/create-media-query-completions';
import { createInitialCompletions } from './helpers/create-initial-completions';
import { createPseudoClassCompletions } from './helpers/create-pseudo-class-completions';
import { createPropertyCompletions } from './helpers/create-property-completions';
import { createValueCompletions } from './helpers/create-value-completions';
import { generateCSSMarkdownString } from '@/shared/generate-css-markdown-string';

const helpersMap: Record<
  CompletionType,
  (
    parsed: Partial<ParsedClass> | undefined,
    position: Range,
  ) => CompletionItem[]
> = {
  initial: createInitialCompletions,
  property: createPropertyCompletions,
  'pseudo-class': createPseudoClassCompletions,
  'media-query': createMediaQueryCompletions,
  value: createValueCompletions,
};

export function completionItemProvider(
  document: TextDocument,
  position: Position,
  token: CancellationToken,
  context: CompletionContext,
): CompletionList {
  const result = getWordAt(document, position);
  if (result === null) {
    return new CompletionList([], true);
  }
  const word = result?.word || '';
  const completionCtx = getCompletionContextType(word);
  const list = new CompletionList(
    completionCtx.types
      .map((type) => {
        return helpersMap[type]?.(completionCtx.parsed || {}, result?.range);
      })
      .filter(Boolean)
      .flat(),
    true,
  );
  return list;
}

export async function completionItemResolver(
  item: CompletionItem,
  token: CancellationToken,
): Promise<CompletionItem> {
  if (!!item.documentation) {
    return item;
  }
  const md = new MarkdownString();
  const css = convert(
    typeof item.label === 'object' ? item.label?.label : item.label,
  );
  if (!css) {
    return item;
  }
  const prettyCss = await generateCSSMarkdownString(css);
  md.appendCodeblock(prettyCss, 'css');
  item.documentation = md;
  return item;
}
