import {
  COLOR_MAX_TONE,
  COLOR_MIN_TONE,
  DEFAULT_ANGLE_UNIT,
  DEFAULT_TIME_UNIT,
  FUNCTION_KEYS,
  OPTIONS,
  PROP_TYPE_COLOR,
  PROP_TYPE_SPACE,
  PROP_UNIT_MAP,
  PropertyHelper,
} from '@f12io/maple';
import * as vscode from 'vscode';
import { AliasCache } from '../helpers/alias-cache';
import { isExtensionEnabled, isFeatureEnabled } from '../helpers/config';
import { isFileExcluded } from '../helpers/exclude';
import { getExactWordRangeAtPosition } from '../helpers/extractor.helper';
import {
  ABBREVIATIONS,
  BUILTIN_ALIASES,
  CSS_OPTIONS,
  DEFAULT_CSS_VALUES,
  GRADIENT_DIRECTIONS,
  MULTI_VALUE_REGEX,
  POPULAR_ABBREVIATIONS,
  PREDEFINED_VARIABLES,
  PSEUDO_CLASSES,
} from '../mapleEngine/data';
import { LanguageServiceRegistry } from '../services/LanguageServiceRegistry';

export class MapleCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext,
  ): vscode.ProviderResult<
    Array<vscode.CompletionItem> | vscode.CompletionList
  > {
    if (
      !isExtensionEnabled(document) ||
      isFileExcluded(document.uri) ||
      !isFeatureEnabled('autoComplete')
    )
      return undefined;

    const documentText = document.getText();
    const offset = document.offsetAt(position);

    const languageService =
      LanguageServiceRegistry.getServiceForDocument(document);
    if (!languageService) return undefined;
    const instances = languageService.extractClasses(documentText);
    const currentInstance = instances.find(
      (inst) => offset >= inst.start && offset <= inst.end,
    );

    if (!currentInstance) {
      return undefined;
    }

    const items: Array<vscode.CompletionItem> = [];

    let isHtmlTag = false;
    const textBeforeCursor = document.getText(
      new vscode.Range(new vscode.Position(0, 0), position),
    );
    const lastOpeningTagIndex = textBeforeCursor.lastIndexOf('<');
    if (lastOpeningTagIndex !== -1) {
      const tagMatch = /^<\s*([a-zA-Z0-9\-]+)/.exec(
        textBeforeCursor.substring(lastOpeningTagIndex),
      );
      if (tagMatch?.[1].toLowerCase() === 'html') {
        isHtmlTag = true;
      }
    }

    if (isHtmlTag) {
      const aliasItem = new vscode.CompletionItem(
        '--alias-',
        vscode.CompletionItemKind.Keyword,
      );
      aliasItem.detail = `Define Custom Maple Alias`;
      aliasItem.documentation = new vscode.MarkdownString(
        `Defines a custom alias on the root HTML element.\n\nExample: \`--alias-truncate=of=hidden;tof=ellipsis;ws=nowrap\``,
      );
      aliasItem.sortText = `1---alias`;
      items.push(aliasItem);
    }

    const customAliases = AliasCache.getAliases(document.uri);

    const exactRange = getExactWordRangeAtPosition(document, position);
    const wordRange = exactRange.wordRange;
    let currentWord = exactRange.currentWord;

    // If we are touching space or quote, currentWord should be empty
    const linePrefix = document
      .lineAt(position)
      .text.substr(0, position.character);
    if (!wordRange && linePrefix.endsWith(' ')) {
      currentWord = '';
    } else if (!wordRange && /["']$/.exec(linePrefix)) {
      currentWord = ''; // right after class="
    }

    // Strip framework prefixes for specific class bindings (e.g., [class.bg-red-500] or class:bg-red-500)
    let frameworkPrefix = '';
    if (currentWord.startsWith('[class.')) {
      frameworkPrefix = '[class.';
      currentWord = currentWord.substring(7);
    } else if (currentWord.startsWith('class:')) {
      frameworkPrefix = 'class:';
      currentWord = currentWord.substring(6);
    }

    // Strip custom alias prefix (e.g. --alias-btn=bgc-red)
    if (currentWord.startsWith('--alias-')) {
      const eqIndex = currentWord.indexOf('=');
      if (eqIndex !== -1) {
        frameworkPrefix += currentWord.substring(0, eqIndex + 1);
        currentWord = currentWord.substring(eqIndex + 1);
      }
    }

    const isMedia = currentWord.startsWith('@');
    const hasPseudo = currentWord.includes(':');

    // Split by ':' to see prefix (e.g. "hover:" or "@md:")
    const parts = currentWord.split(':');
    const prefixParts = parts.slice(0, parts.length - 1);
    const activeWord = parts[parts.length - 1]; // what follows the last colon
    const typedPrefix =
      prefixParts.length > 0 ? prefixParts.join(':') + ':' : '';

    // Helper function to create an item that replaces the current word correctly
    const createItem = (
      label: string,
      insertText: string,
      kind: vscode.CompletionItemKind,
    ) => {
      const item = new vscode.CompletionItem(label, kind);
      item.insertText = frameworkPrefix + insertText;
      item.filterText = frameworkPrefix + insertText;
      if (wordRange) {
        item.range = wordRange;
      }
      return item;
    };

    // Suggest Media Queries and Custom Aliases
    const mediaQueries = [
      ...Object.keys(OPTIONS.breakpoints),
      'dark',
      'light',
      'portrait',
      'landscape',
    ];

    if (isMedia && !hasPseudo) {
      for (const mq of mediaQueries) {
        const item = createItem(
          `@${mq}:`,
          `@${mq}:`,
          vscode.CompletionItemKind.Keyword,
        );
        item.detail = `Maple Media Query`;
        item.documentation = new vscode.MarkdownString(
          `Applies rules for \`@${mq}\` breakpoints.`,
        );
        // Sort media queries higher
        item.sortText = `0-@${mq}`;
        items.push(item);
      }

      for (const [alias, expansion] of customAliases.entries()) {
        const item = createItem(
          `@${alias}`,
          `@${alias}`,
          vscode.CompletionItemKind.Keyword,
        );
        item.detail = `Custom Maple Alias`;
        item.documentation = new vscode.MarkdownString(
          `Expands to: \`${expansion}\``,
        );
        item.sortText = `1-custom-${alias}`;
        items.push(item);
      }

      for (const [alias, expansion] of Object.entries(BUILTIN_ALIASES)) {
        const item = createItem(
          `@${alias}`,
          `@${alias}`,
          vscode.CompletionItemKind.Keyword,
        );
        item.detail = `Maple Built-in Alias`;
        item.documentation = new vscode.MarkdownString(
          `Expands to: \`${expansion}\``,
        );
        item.sortText = `2-${alias}`;
        items.push(item);
      }

      return new vscode.CompletionList(items, true);
    }

    // If we haven't typed a hyphen in the active part, we can suggest pseudo-classes with colon
    if (!activeWord.includes('-') && !isMedia) {
      for (const pc of PSEUDO_CLASSES) {
        const item = createItem(
          `${pc}:`,
          `${typedPrefix}${pc}:`,
          vscode.CompletionItemKind.Keyword,
        );
        item.filterText = frameworkPrefix + typedPrefix + pc; // help fuzzy matcher
        item.detail = `Maple Pseudo Class`;
        item.documentation = new vscode.MarkdownString(
          `Applies rules for \`:${pc}\` pseudo-class.`,
        );
        item.sortText = `8-${pc}`;
        items.push(item);
      }
      for (const mq of mediaQueries) {
        const item = createItem(
          `${mq}:`,
          `${typedPrefix}${mq}:`,
          vscode.CompletionItemKind.Keyword,
        );
        item.filterText = frameworkPrefix + typedPrefix + mq; // help fuzzy matcher
        item.detail = `Maple Container Query`;
        item.documentation = new vscode.MarkdownString(
          `Applies rules for \`${mq}\` container breakpoints.`,
        );
        item.sortText = `0-${mq}`;
        items.push(item);

        const mqItem = createItem(
          `@${mq}:`,
          `${typedPrefix}@${mq}:`,
          vscode.CompletionItemKind.Keyword,
        );
        mqItem.filterText = frameworkPrefix + typedPrefix + `@${mq}`; // help fuzzy matcher
        mqItem.detail = `Maple Media Query`;
        mqItem.documentation = new vscode.MarkdownString(
          `Applies rules for \`@${mq}\` breakpoints.`,
        );
        mqItem.sortText = `0-@${mq}`;
        items.push(mqItem);
      }
    }

    // Predefined Variables (e.g. --l-shift)
    // Show if empty, or starts with -
    if (activeWord === '' || activeWord.startsWith('-')) {
      for (const variable of PREDEFINED_VARIABLES) {
        const item = createItem(
          `${variable.name}=`,
          `${typedPrefix}${variable.name}=`,
          vscode.CompletionItemKind.Variable,
        );
        item.detail = `Maple Predefined Variable`;
        item.documentation = new vscode.MarkdownString(variable.description);
        item.sortText = `1-${variable.name}`;
        items.push(item);
      }
    }

    // If the user hasn't typed a hyphen in the activeWord, suggest prefixes and aliases
    if (!activeWord.includes('-')) {
      for (const [abbr, prop] of Object.entries(ABBREVIATIONS)) {
        const item = createItem(
          `${abbr}-`,
          `${typedPrefix}${abbr}-`,
          vscode.CompletionItemKind.Property,
        );
        item.detail = `Maple: ${prop}`;
        item.documentation = new vscode.MarkdownString(
          `Sets the \`${prop.replace(/([A-Z])/g, '-$1').toLowerCase()}\` CSS property.`,
        );

        const popIndex = POPULAR_ABBREVIATIONS.indexOf(abbr);
        const sortPriority =
          popIndex > -1 ? String(popIndex).padStart(3, '0') : '999';
        item.sortText = `2-${sortPriority}-${abbr}`;

        items.push(item);

        // Add full key (camelCase)
        const fullItem = createItem(
          `${prop}-`,
          `${typedPrefix}${prop}-`,
          vscode.CompletionItemKind.Property,
        );
        fullItem.detail = `Maple (Full Key): ${prop}`;
        fullItem.documentation = item.documentation;
        fullItem.sortText = `2-${sortPriority}-${prop}`;
        items.push(fullItem);

        // Add full key (kebab-case)
        const kebabProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
        if (kebabProp !== prop) {
          const kebabItem = createItem(
            `${kebabProp}-`,
            `${typedPrefix}${kebabProp}-`,
            vscode.CompletionItemKind.Property,
          );
          kebabItem.detail = `Maple (Full Key): ${kebabProp}`;
          kebabItem.documentation = item.documentation;
          kebabItem.sortText = `2-${sortPriority}-${kebabProp}`;
          items.push(kebabItem);
        }
      }

      for (const [alias, expansion] of Object.entries(BUILTIN_ALIASES)) {
        const item = createItem(
          alias,
          `${typedPrefix}${alias}`,
          vscode.CompletionItemKind.Keyword,
        );
        item.detail = `Maple Alias`;
        item.documentation = new vscode.MarkdownString(
          `Expands to: \`${expansion}\``,
        );
        item.sortText = `3-${alias}`;
        items.push(item);
      }

      for (const [alias, expansion] of customAliases.entries()) {
        const item = createItem(
          `@${alias}`,
          `${typedPrefix}@${alias}`,
          vscode.CompletionItemKind.Keyword,
        );
        item.detail = `Custom Maple Alias`;
        item.documentation = new vscode.MarkdownString(
          `Expands to: \`${expansion}\``,
        );
        item.sortText = `3-custom-${alias}`;
        items.push(item);
      }
    } else {
      // User typed a prefix and a hyphen, e.g. "bgc-" or "-m-"
      const isNegative =
        activeWord.startsWith('-') && !activeWord.startsWith('--');
      const checkWord = isNegative ? activeWord.substring(1) : activeWord;
      const activePrefix = checkWord.split('-')[0];
      const negPrefix = isNegative ? '-' : '';

      let mappedPrefix = activePrefix;
      if (!ABBREVIATIONS[activePrefix]) {
        for (const [abbr, propValue] of Object.entries(ABBREVIATIONS)) {
          if (
            propValue === activePrefix ||
            propValue.replace(/([A-Z])/g, '-$1').toLowerCase() === activePrefix
          ) {
            mappedPrefix = abbr;
            break;
          }
        }
      }

      if (ABBREVIATIONS[mappedPrefix]) {
        const prop = ABBREVIATIONS[mappedPrefix];
        const kebabProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
        const propType = PropertyHelper.resolveType(kebabProp, prop);
        const isColorProp = propType === PROP_TYPE_COLOR;

        if (activePrefix === 'bgimg' || activePrefix === 'bg') {
          const typedValue = checkWord.substring(activePrefix.length + 1);
          let argsString = typedValue;
          const doubleUnderscoreIdx = typedValue.indexOf('__');
          if (doubleUnderscoreIdx !== -1) {
            argsString = typedValue.substring(0, doubleUnderscoreIdx);
          }

          const args = argsString.split('|');
          const lastArg = args[args.length - 1];
          const baseClass =
            `${typedPrefix}${negPrefix}${activePrefix}-` +
            (args.length > 1
              ? args.slice(0, args.length - 1).join('|') + '|'
              : '');

          if (doubleUnderscoreIdx === -1) {
            if (args.length === 1) {
              for (const [gKey, gProp] of Object.entries(FUNCTION_KEYS)) {
                if (
                  gProp.includes('gradient') &&
                  matchesPrefix(gKey, lastArg)
                ) {
                  const item = new vscode.CompletionItem(
                    `${baseClass}${gKey}`,
                    vscode.CompletionItemKind.Value,
                  );
                  if (wordRange) item.range = wordRange;
                  item.detail = `Gradient: ${gProp}`;
                  item.sortText = `4-${gKey}`;
                  items.push(item);
                }
              }
            } else {
              for (const dir of GRADIENT_DIRECTIONS) {
                if (matchesPrefix(dir, lastArg)) {
                  const item = new vscode.CompletionItem(
                    `${baseClass}${dir}`,
                    vscode.CompletionItemKind.Value,
                  );
                  if (wordRange) item.range = wordRange;
                  item.detail = `Direction: ${dir.replace(/_/g, ' ')}`;
                  item.sortText = `4-dir-${dir}`;
                  items.push(item);
                }
              }
            }

            const { namedColors } = require('@f12io/coco');
            const colorArgs = lastArg.split('_');
            const colorTypedFull = colorArgs[0];

            const hasOpacity = colorTypedFull.includes('/');
            let colorTyped = colorTypedFull;
            let opacityTyped = '';
            if (hasOpacity) {
              const parts = colorTypedFull.split('/');
              colorTyped = parts[0];
              opacityTyped = parts[1] || '';
            }

            if (colorArgs.length === 1) {
              if (hasOpacity) {
                for (let i = 0; i <= 100; i++) {
                  const opStr = i.toString();
                  if (matchesPrefix(opStr, opacityTyped)) {
                    const opItem = new vscode.CompletionItem(
                      `${baseClass}${colorTyped}/${opStr}`,
                      vscode.CompletionItemKind.Value,
                    );
                    if (wordRange) opItem.range = wordRange;
                    opItem.detail = `Opacity ${opStr}%`;
                    opItem.sortText = `7-${opStr.padStart(3, '0')}`;
                    items.push(opItem);
                  }
                }
              } else {
                for (const colorName of Object.keys(namedColors)) {
                  if (
                    !colorTyped ||
                    matchesPrefix(colorName, colorTyped) ||
                    matchesPrefix(colorTyped, colorName)
                  ) {
                    if (!colorTyped || matchesPrefix(colorName, colorTyped)) {
                      const baseItem = new vscode.CompletionItem(
                        `${baseClass}${colorName}`,
                        vscode.CompletionItemKind.Color,
                      );
                      if (wordRange) baseItem.range = wordRange;
                      baseItem.sortText = `5-${colorName}-000`;
                      items.push(baseItem);
                    }

                    if (
                      colorName !== 'white' &&
                      colorName !== 'black' &&
                      colorTyped.length > 0
                    ) {
                      for (
                        let i = COLOR_MIN_TONE;
                        i <= COLOR_MAX_TONE;
                        i += i >= 100 ? 100 : 50
                      ) {
                        const tone = i.toString();
                        const fullColor = `${colorName}-${tone}`;
                        if (matchesPrefix(fullColor, colorTyped)) {
                          const toneItem = new vscode.CompletionItem(
                            `${baseClass}${fullColor}`,
                            vscode.CompletionItemKind.Color,
                          );
                          if (wordRange) toneItem.range = wordRange;
                          toneItem.sortText = `5-${colorName}-${tone.padStart(3, '0')}`;
                          items.push(toneItem);
                        }
                      }
                    }
                  }
                }
                const transparentItem = new vscode.CompletionItem(
                  `${baseClass}transparent`,
                  vscode.CompletionItemKind.Color,
                );
                if (wordRange) transparentItem.range = wordRange;
                transparentItem.sortText = `5-transparent`;
                items.push(transparentItem);
              }
            } else {
              const commonSuffixes = [
                '0',
                '%',
                '50%',
                '100%',
                '0.25turn',
                '0.5turn',
                '0.75turn',
                '1turn',
                '45deg',
                '90deg',
                '180deg',
              ];
              const colorPrefix = `${baseClass}${colorArgs.slice(0, colorArgs.length - 1).join('_')}_`;
              const suffixTyped = colorArgs[colorArgs.length - 1];
              for (const suf of commonSuffixes) {
                if (matchesPrefix(suf, suffixTyped)) {
                  const item = new vscode.CompletionItem(
                    `${colorPrefix}${suf}`,
                    vscode.CompletionItemKind.Value,
                  );
                  if (wordRange) item.range = wordRange;
                  item.sortText = `6-${suf}`;
                  items.push(item);
                }
              }
            }
          }
        } else if (isColorProp) {
          const typedValue = checkWord.substring(activePrefix.length + 1);
          const { namedColors } = require('@f12io/coco');

          const hasOpacity = typedValue.includes('/');
          let colorTyped = typedValue;
          let opacityTyped = '';
          if (hasOpacity) {
            const parts = typedValue.split('/');
            colorTyped = parts[0];
            opacityTyped = parts[1] || '';
          }

          if (hasOpacity) {
            for (let i = 0; i <= 100; i++) {
              const opStr = i.toString();
              if (matchesPrefix(opStr, opacityTyped)) {
                const opItem = new vscode.CompletionItem(
                  `${typedPrefix}${negPrefix}${activePrefix}-${colorTyped}/${opStr}`,
                  vscode.CompletionItemKind.Value,
                );
                if (wordRange) opItem.range = wordRange;
                opItem.detail = `Opacity ${opStr}%`;
                opItem.sortText = `7-${opStr.padStart(3, '0')}`;
                items.push(opItem);
              }
            }
          } else {
            for (const colorName of Object.keys(namedColors)) {
              if (
                !colorTyped ||
                matchesPrefix(colorName, colorTyped) ||
                matchesPrefix(colorTyped, colorName)
              ) {
                // Base color
                if (!colorTyped || matchesPrefix(colorName, colorTyped)) {
                  const baseItem = new vscode.CompletionItem(
                    `${typedPrefix}${negPrefix}${activePrefix}-${colorName}`,
                    vscode.CompletionItemKind.Color,
                  );
                  if (wordRange) baseItem.range = wordRange;
                  baseItem.detail = `${namedColors[colorName]}`;
                  baseItem.sortText = `5-${colorName}-000`;
                  items.push(baseItem);
                }

                // Tones
                if (
                  colorName !== 'white' &&
                  colorName !== 'black' &&
                  colorTyped.length > 0
                ) {
                  for (
                    let i = COLOR_MIN_TONE;
                    i <= COLOR_MAX_TONE;
                    i += i >= 100 ? 100 : 50
                  ) {
                    const tone = i.toString();
                    const fullColor = `${colorName}-${tone}`;
                    if (matchesPrefix(fullColor, colorTyped)) {
                      const toneItem = new vscode.CompletionItem(
                        `${typedPrefix}${negPrefix}${activePrefix}-${fullColor}`,
                        vscode.CompletionItemKind.Color,
                      );
                      if (wordRange) toneItem.range = wordRange;
                      toneItem.detail = `${namedColors[colorName]} tone ${tone}`;
                      toneItem.sortText = `5-${colorName}-${tone.padStart(3, '0')}`;
                      items.push(toneItem);
                    }
                  }
                }
              }
            }

            const transparentItem = new vscode.CompletionItem(
              `${typedPrefix}${negPrefix}${activePrefix}-transparent`,
              vscode.CompletionItemKind.Color,
            );
            if (wordRange) transparentItem.range = wordRange;
            transparentItem.sortText = `5-transparent`;
            items.push(transparentItem);

            const currentItem = new vscode.CompletionItem(
              `${typedPrefix}${negPrefix}${activePrefix}-current`,
              vscode.CompletionItemKind.Color,
            );
            if (wordRange) currentItem.range = wordRange;
            currentItem.sortText = `5-current`;
            items.push(currentItem);

            const inheritItem = new vscode.CompletionItem(
              `${typedPrefix}${negPrefix}${activePrefix}-inherit`,
              vscode.CompletionItemKind.Color,
            );
            if (wordRange) inheritItem.range = wordRange;
            inheritItem.sortText = `5-inherit`;
            items.push(inheritItem);
          }
        } else {
          const typedValue = checkWord.substring(activePrefix.length + 1);
          const predefinedOptions = CSS_OPTIONS[prop] || [];

          if (predefinedOptions.length > 0) {
            for (const opt of predefinedOptions) {
              if (matchesPrefix(opt, typedValue)) {
                const item = new vscode.CompletionItem(
                  `${typedPrefix}${negPrefix}${activePrefix}-${opt}`,
                  vscode.CompletionItemKind.Value,
                );
                if (wordRange) item.range = wordRange;
                item.detail = `Value: ${opt}`;
                item.sortText = `4-${opt}`;
                items.push(item);
              }
            }
          } else {
            let sizes: Array<string> = [];
            let isFractionAllowed = false;

            let currentTypedValue = typedValue;
            let multiPrefix = '';
            const isMultiValue = MULTI_VALUE_REGEX.test(prop);

            if (isMultiValue && typedValue.includes('_')) {
              const parts = typedValue.split('_');
              currentTypedValue = parts[parts.length - 1];
              multiPrefix = parts.slice(0, parts.length - 1).join('_') + '_';
            }

            if (PROP_UNIT_MAP[prop] === DEFAULT_TIME_UNIT) {
              sizes = ['75', '100', '150', '200', '300', '500', '700', '1000'];
            } else if (PROP_UNIT_MAP[prop] === DEFAULT_ANGLE_UNIT) {
              sizes = ['0', '15', '30', '45', '60', '90', '180', '360'];
            } else if (propType !== PROP_TYPE_SPACE) {
              if (prop.toLowerCase().includes('opacity')) {
                sizes = [
                  '0',
                  '5',
                  '10',
                  '20',
                  '25',
                  '30',
                  '40',
                  '50',
                  '60',
                  '70',
                  '75',
                  '80',
                  '90',
                  '95',
                  '100',
                ];
              } else if (prop.toLowerCase().includes('weight')) {
                sizes = [
                  '100',
                  '200',
                  '300',
                  '400',
                  '500',
                  '600',
                  '700',
                  '800',
                  '900',
                ];
              } else if (prop.toLowerCase().includes('index')) {
                sizes = [
                  '0',
                  '1',
                  '2',
                  '3',
                  '4',
                  '5',
                  '10',
                  '20',
                  '30',
                  '40',
                  '50',
                  '100',
                ];
              } else {
                sizes = [
                  '0',
                  '1',
                  '2',
                  '3',
                  '4',
                  '5',
                  '6',
                  '7',
                  '8',
                  '9',
                  '10',
                ];
              }
            } else {
              sizes = generateSpacingValues(currentTypedValue);
              isFractionAllowed = true;
            }

            for (const size of sizes) {
              if (
                !currentTypedValue ||
                matchesPrefix(size, currentTypedValue)
              ) {
                const item = new vscode.CompletionItem(
                  `${typedPrefix}${negPrefix}${activePrefix}-${multiPrefix}${size}`,
                  vscode.CompletionItemKind.Value,
                );
                if (wordRange) item.range = wordRange;
                item.detail = `Value ${size}`;
                const numVal = isNaN(parseFloat(size)) ? 999 : parseFloat(size);
                item.sortText = `4-${String(numVal * 100).padStart(6, '0')}`;
                items.push(item);
              }
            }

            // Add fraction values for generic numeric props (like width, height)
            if (
              isFractionAllowed &&
              ['w', 'h', 'mnw', 'mnh', 'mxw', 'mxh'].includes(activePrefix)
            ) {
              const fractions = generateFractionValues();
              for (const frac of fractions) {
                if (
                  !currentTypedValue ||
                  matchesPrefix(frac.value, currentTypedValue)
                ) {
                  const item = new vscode.CompletionItem(
                    `${typedPrefix}${negPrefix}${activePrefix}-${multiPrefix}${frac.value}`,
                    vscode.CompletionItemKind.Value,
                  );
                  if (wordRange) item.range = wordRange;
                  item.detail = `Size ${frac.percentage}`;
                  item.sortText = `4-frac-${frac.sortIndex}`;
                  items.push(item);
                }
              }
            }
          }

          // Also add default CSS values (inherit, initial, etc)
          for (const defVal of DEFAULT_CSS_VALUES) {
            if (matchesPrefix(defVal, typedValue)) {
              const item = new vscode.CompletionItem(
                `${typedPrefix}${negPrefix}${activePrefix}-${defVal}`,
                vscode.CompletionItemKind.Value,
              );
              if (wordRange) item.range = wordRange;
              item.detail = `CSS Default: ${defVal}`;
              item.sortText = `5-${defVal}`;
              items.push(item);
            }
          }
        }
      }
    }

    return new vscode.CompletionList(items, true);
  }
}

function matchesPrefix(val: string, prefix: string): boolean {
  return val.startsWith(prefix);
}

function generateSpacingValues(prefix: string): Array<string> {
  const values: Array<string> = [];

  // Base values with decimals
  const baseValues = new Array(40).fill(1).map((_, i) => (i * 0.25).toString());
  if (prefix) {
    const baseVal = Math.ceil(parseFloat(prefix));
    if (!isNaN(baseVal) && baseVal >= 10) {
      for (let i = 0; i < 4; i++) {
        baseValues.push(`${baseVal + i * 0.25}`);
      }
    }
    if (!isNaN(baseVal)) {
      for (let i = 0; i < 40; i++) {
        baseValues.push(`${baseVal * 10 + i * 0.25}`);
      }
    }
  }

  // Add auto
  baseValues.push('auto');
  // Filter by prefix
  for (const val of baseValues) {
    if (matchesPrefix(val, prefix) && !values.includes(val)) {
      values.push(val);
    }
  }

  return values;
}

function generateFractionValues(base = 12) {
  const items = [];
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

  for (let i = 1; i <= base; i++) {
    const common = gcd(i, base);
    const reducedNum = i / common;
    const reducedDen = base / common;
    const reduced = `${reducedNum}/${reducedDen}`;

    const percentage = (i / base) * 100;

    items.push({
      value: reduced,
      sortIndex: `${i}/${base}`.padStart(5, '0'),
      percentage: `${percentage.toFixed(2)}%`,
    });
  }

  // De-duplicate fractions
  return items.filter(
    (item, index, self) =>
      index === self.findIndex((t) => t.value === item.value),
  );
}
