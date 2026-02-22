// import {
//   CompletionItem,
//   CompletionList,
//   CompletionParams,
//   Position,
// } from 'vscode-languageserver';
// import { TextDocument } from 'vscode-languageserver-textdocument';
// import { getWordAt } from './get-word-at';
// import { CompletionType, getCompletionContext } from './get-completion-context';
// import {
//   createInitialCompletions,
//   createMediaQueryCompletions,
//   createPropertyCompletions,
//   createPseudoClassCompletions,
// } from './completion-item-helpers';
// import { ParsedClass } from '@f12io/maple';

// const helpersMap: Record<
//   CompletionType,
//   (
//     parsed: ParsedClass | undefined,
//     position: Position,
//   ) => Promise<CompletionItem[]>
// > = {
//   initial: createInitialCompletions,
//   property: createPropertyCompletions,
//   'pseudo-class': createPseudoClassCompletions,
//   'media-query': createMediaQueryCompletions,
//   value: () => Promise.resolve([]),
// };

// export async function completionItemProvider(
//   document: TextDocument,
//   params: CompletionParams,
// ): Promise<CompletionList> {
//   const result = getWordAt(document, params.position);
//   const word = result?.word || '';
//   const completionCtx = getCompletionContext(word);
//   return {
//     isIncomplete: true,
//     items: (
//       await Promise.all(
//         completionCtx.types.map((type) => {
//           return helpersMap[type]?.(completionCtx.parsed, params.position);
//         }),
//       )
//     )
//       .filter(Boolean)
//       .flat(),
//   };
// }
