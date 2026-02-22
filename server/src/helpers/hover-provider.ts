import { Hover, TextDocumentPositionParams } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getWordAt } from './get-word-at';
import { convert } from '@f12io/maple';
import { generateCSSMarkdownString } from '@/shared/generate-css-markdown-string';

export async function hoverProvider(
  document?: TextDocument,
  params?: TextDocumentPositionParams,
) {
  if (!document) return null;
  if (!params) return null;

  // 1. Use the helper to find the utility class
  const result = getWordAt(document, params.position);
  if (!result) return null;

  // 2. Your logic to get the raw CSS output (convert function)
  const output = convert(result.word);
  if (!output) return null;
  const formattedCss = await generateCSSMarkdownString(output);
  return {
    contents: {
      kind: 'markdown',
      value: ['```css', formattedCss, '```'].join('\n'),
    },
    range: result.range, // Highlight the token in the editor
  } as Hover;
}
