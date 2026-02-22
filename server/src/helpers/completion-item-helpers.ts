// import {
//   parseClass,
//   ParsedClass,
//   PRECALCULATED_PROP_ABBREVIATIONS,
// } from '@f12io/maple';
// import {
//   CompletionItem,
//   CompletionItemKind,
//   Position,
//   Range,
// } from 'vscode-languageserver';
// import {
//   BACKDROP_FILTER_KEYS,
//   BREAKPOINTS,
//   CUSTOM_MEDIA_QUERIES,
//   FILTER_KEYS,
//   FLEX_LAYOUT,
//   POPULAR_ABBREVIATIONS,
//   PSEUDO_CLASSES,
//   SHORTCUTS,
//   TRANSFORM_KEYS,
//   VIEWPORT_QUERIES,
// } from '../constants';
// import { getUtilKey } from './get-util-key';
// import { camelToKebab } from './string-helper';

// /**
//  * Check if a string matches prefix (case-insensitive)
//  */
// function matchesPrefix(text: string, prefix: string): boolean {
//   if (!prefix) {
//     return true;
//   }
//   return text.toLowerCase().includes(prefix.toLowerCase());
// }

// /**
//  * Create completion items for media queries
//  */
// export async function createMediaQueryCompletions(
//   parsed: ParsedClass | undefined,
//   position: Position,
// ): Promise<CompletionItem[]> {
//   const items: CompletionItem[] = [];
//   if (!parsed) {
//     return [];
//   }
//   const utilKey = getUtilKey(parsed);
//   if (utilKey === null) {
//     return [];
//   }
//   const hasAt = utilKey.startsWith('@');
//   const searchKey = hasAt ? utilKey.replace('@', '') : utilKey;
//   const indexOfUtilKey = parsed.srcClass?.lastIndexOf(utilKey) || 0;
//   const prefix = parsed.srcClass?.slice(0, indexOfUtilKey) || '';
//   // Add breakpoint completions
//   for (const bp of BREAKPOINTS) {
//     if (matchesPrefix(bp.name, searchKey)) {
//       const val = `${prefix}${hasAt ? '@' : ''}${bp.name}:`;
//       const item: CompletionItem = { label: val };
//       item.detail = bp.detail;
//       item.documentation = {
//         kind: 'markdown',
//         value: `**${bp.name}** (min-width: ${bp.value})\n\n${bp.detail}\n\nExample: \`${bp.name}:p-4\``,
//       };
//       const start = {
//         line: position.line,
//         character: position.character - parsed.srcClass.length,
//       };
//       const range = { start, end: position };
//       item.textEdit = { range: range, newText: val };
//       item.command = {
//         command: 'editor.action.triggerSuggest',
//         title: '',
//       };
//       item.sortText = `0-${bp.name}`;
//       items.push(item);
//     }
//   }

//   if (hasAt) {
//     // Add viewport/media query completions
//     for (const mq of VIEWPORT_QUERIES) {
//       const mqName = mq.name.slice(1);
//       if (matchesPrefix(mqName, searchKey) || matchesPrefix(mq.name, prefix)) {
//         const item: CompletionItem = {
//           label: mq.name + ':',
//           kind: CompletionItemKind.Module,
//         };
//         item.detail = mq.detail;
//         item.documentation = {
//           kind: 'markdown',
//           value: `**${mq.name}**\n\n${mq.detail}\n\nExample: \`${mq.name}:bgc-black\``,
//         };
//         const start = {
//           line: position.line,
//           character: position.character - parsed.srcClass.length,
//         };
//         const range = { start, end: position };
//         item.textEdit = { range: range, newText: mq.name + ':' };
//         /* item.command = {
//           command: 'editor.action.triggerSuggest',
//           title: '',
//         }; */
//         item.sortText = `1-${mq.name}`;
//         items.push(item);
//       }
//     }
//   }

//   // Add custom media query completions
//   for (const cmq of CUSTOM_MEDIA_QUERIES) {
//     if (matchesPrefix(cmq.name, searchKey)) {
//       const val = `${hasAt ? '@' : ''}${cmq.name}`;
//       const item: CompletionItem = {
//         label: val,
//         kind: CompletionItemKind.Module,
//         insertTextFormat: 2,
//       };
//       item.detail = cmq.detail;
//       const start = {
//         line: position.line,
//         character: position.character - parsed.srcClass.length,
//       };
//       const range = { start, end: position };
//       item.textEdit = { range: range, newText: `${val}$1:` };
//       item.command = {
//         command: 'editor.action.triggerSuggest',
//         title: '',
//       };
//       item.sortText = `2-${cmq.name}`;
//       items.push(item);
//     }
//   }
//   return items;
// }

// /**
//  * Create initial suggestions with popular properties only
//  */
// export async function createInitialCompletions(
//   parsed: ParsedClass | undefined,
//   position: Position,
// ): Promise<CompletionItem[]> {
//   const items: CompletionItem[] = [];
//   let sortIndex = 0;
//   // Calculate the start of the current word "mt"
//   if (!parsed) {
//     return [];
//   }
//   // Add only popular abbreviations
//   for (const abbr of POPULAR_ABBREVIATIONS) {
//     const fullName = PRECALCULATED_PROP_ABBREVIATIONS[abbr];
//     if (fullName) {
//       const item: CompletionItem = { label: abbr };
//       item.detail = `${fullName} (abbreviation)`;
//       item.documentation = {
//         kind: 'markdown',
//         value: `**${abbr}** → \`${fullName}\`\n\nMaple property abbreviation`,
//       };
//       const start = {
//         line: position.line,
//         character: position.character - parsed.srcClass.length,
//       };
//       const range = { start, end: position };
//       item.textEdit = { range: range, newText: abbr + '-' };
//       item.sortText = '0-' + String(sortIndex++).padStart(3, '0');
//       items.push(item);
//     }
//   }

//   // Add shortcuts
//   for (const [key, cssValue] of Object.entries(SHORTCUTS)) {
//     const item: CompletionItem = { label: key };
//     item.detail = cssValue;
//     item.documentation = {
//       kind: 'markdown',
//       value: `**${key}** → \`${cssValue}\`\n\nMaple property abbreviation`,
//     };
//     const start = {
//       line: position.line,
//       character: position.character - parsed.srcClass.length,
//     };
//     const range = { start, end: position };
//     item.textEdit = { range: range, newText: key };
//     item.sortText = '0-' + String(sortIndex++).padStart(3, '0');
//     items.push(item);
//   }

//   // Add self selector
//   const selfItem: CompletionItem = { label: '&' };
//   selfItem.detail = 'Self selector';
//   selfItem.documentation = {
//     kind: 'markdown',
//     value: 'Target self with modifier\n\nExample: `&:hover:bgc-blue`',
//   };
//   const start = {
//     line: position.line,
//     character: position.character - parsed.srcClass.length,
//   };
//   const range = { start, end: position };
//   selfItem.textEdit = { range: range, newText: '&' };
//   selfItem.sortText = '0-' + String(sortIndex++).padStart(3, '0');
//   items.push(selfItem);
//   const mediaItems = await createMediaQueryCompletions(parsed, position);
//   return [...items, ...mediaItems];
// }

// /**
//  * Create completion items for property abbreviations (when user is typing)
//  * Order: abbreviations (0-), camelCase (1-), kebab-case (2-)
//  */
// export async function createPropertyCompletions(
//   parsed: ParsedClass | undefined,
//   position: Position,
// ): Promise<CompletionItem[]> {
//   if (!parsed) {
//     return [];
//   }
//   const items: CompletionItem[] = [];
//   const seen = new Set<string>();
//   const utilKey = getUtilKey(parsed);
//   if (utilKey === null) {
//     return [];
//   }
//   const indexOfUtilKey = parsed.srcClass?.lastIndexOf(utilKey) || 0;
//   const prefix = parsed.srcClass?.slice(0, indexOfUtilKey) || '';

//   // Add shortcuts FOURTH
//   for (const [key, cssValue] of Object.entries(SHORTCUTS)) {
//     if (matchesPrefix(key, utilKey)) {
//       if (!seen.has(key)) {
//         seen.add(key);
//         const item: CompletionItem = {
//           label: `${prefix}${key}-`,
//         };
//         item.detail = cssValue;
//         item.documentation = {
//           kind: 'markdown',
//           value: `**${key}** → \`${cssValue}\`\n\nMaple shortcut`,
//         };
//         const start = {
//           line: position.line,
//           character: position.character - parsed.srcClass.length,
//         };
//         const range = { start, end: position };
//         item.textEdit = {
//           newText: `${prefix}${key}`,
//           range: range,
//         };
//         item.sortText = `3-${key}`;
//         items.push(item);
//       }
//     }
//   }

//   // Add Flex Layout keys
//   for (const [key, fullName] of Object.entries(FLEX_LAYOUT)) {
//     if (matchesPrefix(key, utilKey)) {
//       if (!seen.has(key)) {
//         seen.add(key);
//         const item: CompletionItem = {
//           label: `${prefix}${key}-`,
//           insertTextFormat: 2,
//         };
//         item.detail = `${fullName} (Layout)`;
//         item.documentation = {
//           kind: 'markdown',
//           value: `**${key}** → \`${fullName}\`\n`,
//         };
//         const start = {
//           line: position.line,
//           character: position.character - parsed.srcClass.length,
//         };
//         const range = { start, end: position };
//         item.textEdit = {
//           newText: `${prefix}${key}-$1`,
//           range: range,
//         };
//         item.detail = `${fullName} (Layout)`;
//         /* item.command = {
//           command: 'editor.action.triggerSuggest',
//           title: '',
//         }; */
//         item.sortText = `0-${key}`;
//         items.push(item);
//       }
//     }
//   }

//   // Add abbreviation-based completions FIRST
//   for (const [abbr, fullName] of Object.entries(
//     PRECALCULATED_PROP_ABBREVIATIONS,
//   ) as Array<[string, string]>) {
//     if (matchesPrefix(abbr, utilKey)) {
//       if (!seen.has(abbr)) {
//         seen.add(abbr);
//         const item: CompletionItem = {
//           label: `${prefix}${abbr}-`,
//           insertTextFormat: 2,
//         };
//         item.detail = `${fullName} (abbreviation)`;
//         item.kind = CompletionItemKind.Property;
//         item.documentation = {
//           kind: 'markdown',
//           value: `**${abbr}** → \`${fullName}\`\n\nMaple property abbreviation`,
//         };
//         const start = {
//           line: position.line,
//           character: position.character - parsed.srcClass.length,
//         };
//         const range = { start, end: position };
//         item.textEdit = {
//           newText: `${prefix}${abbr}-$1`,
//           range: range,
//         };

//         /* item.command = {
//           command: 'editor.action.triggerSuggest',
//           title: '',
//         }; */
//         item.sortText = `0-${abbr.padStart(10, '0')}`;
//         items.push(item);
//       }
//     }
//   }
//   // Add camelCase versions SECOND
//   for (const [abbr, fullName] of Object.entries(
//     PRECALCULATED_PROP_ABBREVIATIONS,
//   ) as Array<[string, string]>) {
//     if (matchesPrefix(fullName, utilKey)) {
//       if (!seen.has(fullName)) {
//         seen.add(fullName);
//         const item: CompletionItem = {
//           label: `${prefix}${fullName}-`,
//           insertTextFormat: 2,
//         };
//         item.detail = `${fullName} (camelCase)`;
//         item.kind = CompletionItemKind.Property;
//         item.documentation = {
//           kind: 'markdown',
//           value: `**${fullName}** (camelCase)\n\nAlias for: \`${abbr}\``,
//         };
//         const start = {
//           line: position.line,
//           character: position.character - parsed.srcClass.length,
//         };
//         const range = { start, end: position };
//         item.textEdit = {
//           newText: `${prefix}${fullName}-$1`,
//           range: range,
//         };

//         /* item.command = {
//           command: 'editor.action.triggerSuggest',
//           title: '',
//         }; */
//         item.sortText = `1-${fullName}`;
//         items.push(item);
//       }
//     }
//   }

//   // Add kebab-case versions THIRD
//   for (const [abbr, fullName] of Object.entries(
//     PRECALCULATED_PROP_ABBREVIATIONS,
//   ) as Array<[string, string]>) {
//     const kebab = camelToKebab(fullName);
//     if (kebab !== fullName && matchesPrefix(kebab, utilKey)) {
//       if (!seen.has(kebab)) {
//         seen.add(kebab);
//         const item: CompletionItem = {
//           label: `${prefix}${kebab}-`,
//           insertTextFormat: 2,
//         };
//         item.detail = `${kebab} (kebab-case)`;
//         item.kind = CompletionItemKind.Property;
//         item.documentation = {
//           kind: 'markdown',
//           value: `**${kebab}** (kebab-case)\n\nAlias for: \`${abbr}\``,
//         };
//         const start = {
//           line: position.line,
//           character: position.character - parsed.srcClass.length,
//         };
//         const range = { start, end: position };
//         item.textEdit = {
//           newText: `${prefix}${kebab}-$1`,
//           range: range,
//         };

//         /* item.command = {
//           command: 'editor.action.triggerSuggest',
//           title: '',
//         }; */
//         item.sortText = `2-${kebab}`;
//         items.push(item);
//       }
//     }
//   }

//   // Add transform keys
//   for (const [key, fullName] of Object.entries(TRANSFORM_KEYS)) {
//     if (matchesPrefix(key, utilKey)) {
//       if (!seen.has(key)) {
//         seen.add(key);
//         const item: CompletionItem = {
//           label: `${prefix}${key}-`,
//           insertTextFormat: 2,
//         };
//         item.detail = `${fullName} (transform)`;
//         item.kind = CompletionItemKind.Function;
//         item.documentation = {
//           kind: 'markdown',
//           value: `**${key}** → \`${fullName}\`\n\nTransform function`,
//         };
//         const start = {
//           line: position.line,
//           character: position.character - parsed.srcClass.length,
//         };
//         const range = { start, end: position };
//         item.textEdit = {
//           newText: `${prefix}${key}-$1`,
//           range: range,
//         };
//         /* item.command = {
//           command: 'editor.action.triggerSuggest',
//           title: '',
//         }; */
//         item.sortText = `4-${key}`;
//         items.push(item);
//       }
//     }
//   }

//   // Add filter keys
//   for (const [key, fullName] of Object.entries(FILTER_KEYS)) {
//     if (matchesPrefix(key, utilKey)) {
//       if (!seen.has(key)) {
//         seen.add(key);
//         const item: CompletionItem = {
//           label: `${prefix}${key}-`,
//           insertTextFormat: 2,
//         };
//         item.detail = `${fullName} (filter)`;
//         item.kind = CompletionItemKind.Function;
//         item.documentation = {
//           kind: 'markdown',
//           value: `**${key}** → \`${fullName}\`\n\nFilter function`,
//         };
//         const start = {
//           line: position.line,
//           character: position.character - parsed.srcClass.length,
//         };
//         const range = { start, end: position };
//         item.textEdit = {
//           newText: `${prefix}${key}-$1`,
//           range: range,
//         };
//         /* item.command = {
//           command: 'editor.action.triggerSuggest',
//           title: '',
//         }; */
//         item.sortText = `5-${key}`;
//         items.push(item);
//       }
//     }
//   }

//   // Add backdrop filter keys
//   for (const [key, fullName] of Object.entries(BACKDROP_FILTER_KEYS)) {
//     if (matchesPrefix(key, utilKey)) {
//       if (!seen.has(key)) {
//         seen.add(key);
//         const item: CompletionItem = {
//           label: `${prefix}${key}`,
//           insertTextFormat: 2,
//         };
//         item.detail = `${fullName} (backdrop-filter)`;
//         item.kind = CompletionItemKind.Function;
//         item.documentation = {
//           kind: 'markdown',
//           value: `**${key}** → \`backdrop-filter: ${fullName}\``,
//         };
//         const start = {
//           line: position.line,
//           character: position.character - parsed.srcClass.length,
//         };
//         const range = { start, end: position };
//         item.textEdit = {
//           newText: `${prefix}${key}-$1`,
//           range: range,
//         };
//         /* item.command = {
//           command: 'editor.action.triggerSuggest',
//           title: '',
//         }; */
//         item.sortText = `6-${key}`;
//         items.push(item);
//       }
//     }
//   }

//   return items;
// }

// /**
//  * Create completion items for pseudo-classes (self selector)
//  */
// export async function createPseudoClassCompletions(
//   parsed: ParsedClass | undefined,
//   position: Position,
// ): Promise<CompletionItem[]> {
//   if (!parsed) {
//     return [];
//   }
//   const items: CompletionItem[] = [];
//   const utilKey = getUtilKey(parsed);
//   if (utilKey === null) {
//     return items;
//   }
//   const indexOfUtilKey = parsed.srcClass?.lastIndexOf(utilKey) || 0;
//   const prefix = parsed.srcClass?.slice(0, indexOfUtilKey) || '&:';

//   for (const pseudo of PSEUDO_CLASSES) {
//     if (matchesPrefix(pseudo.name, utilKey) || utilKey === '') {
//       const item: CompletionItem = {
//         label: `${prefix}${pseudo.name}:`,
//         insertTextFormat: 2,
//       };
//       item.detail = `${pseudo.detail}`;
//       item.kind = CompletionItemKind.Keyword;
//       item.documentation = {
//         kind: 'markdown',
//         value: `**${pseudo.name}**\n\n${pseudo.detail}\n\nExample: \`&${pseudo.name}:bgc-red\``,
//       };
//       const start = {
//         line: position.line,
//         character: position.character - parsed.srcClass.length,
//       };
//       const range = { start, end: position };
//       item.textEdit = {
//         newText: `${prefix}${pseudo.name}:$1`,
//         range: range,
//       };

//       item.command = {
//         command: 'editor.action.triggerSuggest',
//         title: '',
//       };
//       item.sortText = `0-${pseudo.name}`;
//       items.push(item);
//     }
//   }

//   return items;
// }
