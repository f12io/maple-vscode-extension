import {
  buildRule,
  BUILTIN_ALIASES,
  COLOR_MAX_TONE,
  COLOR_MIN_TONE,
  PROP_TYPE_COLOR,
} from '@f12io/maple';
import { MAPLE_CLASS_REGEX } from '@f12io/maple-language-core';
import * as vscode from 'vscode';
import { AliasCache } from '../helpers/alias-cache';
import { isExtensionEnabled, isFeatureEnabled } from '../helpers/config';
import { isFileExcluded } from '../helpers/exclude';
import { safeRun } from '../helpers/logger';
import {
  checkConverted,
  getAliasName,
  isAliasDefinition,
  isAliasMarker,
  parseMapleToken,
  stripQuotes,
} from '../helpers/maple-parser';
import { LanguageServiceRegistry } from '../services/LanguageServiceRegistry';

/** Delay before re-linting a document after the user stops typing. */
const DIAGNOSTICS_DEBOUNCE_MS = 250;

export function refreshDiagnostics(
  doc: vscode.TextDocument,
  mapleDiagnostics: vscode.DiagnosticCollection,
): void {
  safeRun(
    'diagnostics',
    () => doRefreshDiagnostics(doc, mapleDiagnostics),
    undefined,
  );
}

function doRefreshDiagnostics(
  doc: vscode.TextDocument,
  mapleDiagnostics: vscode.DiagnosticCollection,
): void {
  if (
    !isExtensionEnabled(doc) ||
    isFileExcluded(doc.uri) ||
    !isFeatureEnabled('diagnostics')
  ) {
    mapleDiagnostics.set(doc.uri, []);
    return;
  }

  const diagnostics: Array<vscode.Diagnostic> = [];
  const text = doc.getText();

  const languageService = LanguageServiceRegistry.getServiceForDocument(doc);
  if (!languageService) {
    mapleDiagnostics.set(doc.uri, []);
    return;
  }

  const classInstances = languageService.extractClasses(text);

  for (const instance of classInstances) {
    const classValue = instance.value;
    const seenSelectors = new Map<
      string,
      { range: vscode.Range; isAdded: boolean }
    >();

    const tokens = languageService.tokenizeClassesWithIndices(classValue);

    for (const token of tokens) {
      if (token.value.includes('${') || token.hasInterpolation) continue;

      for (const wordMatch of token.value.matchAll(MAPLE_CLASS_REGEX)) {
        let cls = wordMatch[0];

        // Check if this class is cut off at the end of the extracted instance by an interpolation
        const wordEndOffset = token.start + wordMatch.index + cls.length;
        if (wordEndOffset === classValue.length) {
          const nextSlice = text
            .substring(instance.end, instance.end + 5)
            .trim();
          if (
            nextSlice.startsWith('${') ||
            nextSlice.startsWith('@(') ||
            nextSlice.startsWith('<?') ||
            nextSlice.startsWith('{') ||
            /^['"`]\s*[\.\+]/.test(nextSlice) // Matches: ' . or " + etc. (string concatenation)
          ) {
            continue; // Skip this token, it was cut off by an expression
          }
        }

        const stripped = stripQuotes(cls);
        cls = stripped.word;

        if (cls.length === 0) continue;

        const { activeWord, isMapleIntent } = parseMapleToken(cls);

        if (!isMapleIntent) {
          continue;
        }

        let hasError = false;
        let errorMsg = '';

        if (isMapleIntent) {
          // Let the engine validate the syntax
          const converted = checkConverted(cls);

          const rule = buildRule(cls);

          let isShadeError = false;
          if (rule?.parsed?.propType === PROP_TYPE_COLOR) {
            const parts = rule.parsed.utilVal.split('-');
            if (parts.length > 1) {
              const tonePart = parts[parts.length - 1];
              const tone = parseInt(tonePart.split('/')[0]);
              if (
                !isNaN(tone) &&
                (tone < COLOR_MIN_TONE || tone > COLOR_MAX_TONE)
              ) {
                hasError = true;
                errorMsg = `Invalid shade: '${tone}'. Must be between ${COLOR_MIN_TONE} and ${COLOR_MAX_TONE}.`;
                isShadeError = true;
              }
            }
          }

          if (isShadeError) {
            // already set
          } else if (cls.endsWith('!')) {
            hasError = true;
            errorMsg = `Invalid usage of '!'. To mark a utility as important, the exclamation mark must be placed at the beginning (e.g., '!${cls.slice(0, -1)}').`;
          } else if (
            rule?.parsed?.utilOp === '-' &&
            !rule.parsed.utilVal.startsWith('[') &&
            rule.parsed.utilVal.includes('_!important')
          ) {
            hasError = true;
            errorMsg = `Invalid usage of '!important'. Use '=' operator or '[]' brackets for string literals.`;
          } else if (
            isAliasDefinition(activeWord) &&
            activeWord.includes('=')
          ) {
            if (instance.tagName && instance.tagName !== 'html') {
              hasError = true;
              errorMsg = `Maple aliases can only be defined on the 'html' element. Found on '${instance.tagName}'.`;
            }
          } else if (!converted) {
            // Check if it's a valid alias before flagging as invalid.
            // Unescape activeWord in case parseClass fell back to propKeyKebab
            const unescapedWord = activeWord.replace(/\\/g, '');
            const rawAliasBase = unescapedWord
              .replace(/=$/, '')
              .replace(/\(.*\)$/, '');
            const aliasName = getAliasName(rawAliasBase);
            let isAlias = false;

            if (
              isAliasMarker(rawAliasBase) &&
              AliasCache.getAliases(doc.uri).has(aliasName)
            ) {
              isAlias = true;
            } else if (BUILTIN_ALIASES[aliasName]) {
              isAlias = true;
            }

            if (!isAlias) {
              if (
                (doc.languageId === 'razor' ||
                  doc.languageId === 'aspnetcorerazor') &&
                (cls.startsWith('@') || cls.includes('(') || cls.includes(')'))
              ) {
                // Ignore razor variables and expressions
              } else {
                hasError = true;
                errorMsg = `Invalid maple class: '${cls}'`;
              }
            }
          }
        }

        if (hasError) {
          const startIdx = instance.start + token.start + wordMatch.index;
          const endIdx = startIdx + cls.length;

          const range = new vscode.Range(
            doc.positionAt(startIdx),
            doc.positionAt(endIdx),
          );

          const diagnostic = new vscode.Diagnostic(
            range,
            errorMsg,
            vscode.DiagnosticSeverity.Warning,
          );
          diagnostic.source = 'Maple';
          diagnostics.push(diagnostic);
        } else if (isMapleIntent) {
          // If it's valid, check for conflicts
          const converted = checkConverted(cls);
          if (converted) {
            const rule = buildRule(cls);
            const conflictKey = rule?.parsed?.conflictKey;

            if (conflictKey) {
              const startIdx = instance.start + token.start + wordMatch.index;
              const endIdx = startIdx + cls.length;
              const range = new vscode.Range(
                doc.positionAt(startIdx),
                doc.positionAt(endIdx),
              );

              const previousSelector = seenSelectors.get(conflictKey);
              if (previousSelector) {
                if (!previousSelector.isAdded) {
                  previousSelector.isAdded = true;
                  seenSelectors.set(conflictKey, previousSelector);

                  const firstDiagnostic = new vscode.Diagnostic(
                    previousSelector.range,
                    `Conflicted utility usage: '${conflictKey}'`,
                    vscode.DiagnosticSeverity.Warning,
                  );
                  firstDiagnostic.source = 'Maple';
                  diagnostics.push(firstDiagnostic);
                }

                const diagnostic = new vscode.Diagnostic(
                  range,
                  `Conflicted utility usage: '${conflictKey}'`,
                  vscode.DiagnosticSeverity.Warning,
                );
                diagnostic.source = 'Maple';
                diagnostics.push(diagnostic);
              } else {
                seenSelectors.set(conflictKey, { range, isAdded: false });
              }
            }
          }
        }
      }
    }
  }

  mapleDiagnostics.set(doc.uri, diagnostics);
}

export function subscribeToDocumentChanges(
  context: vscode.ExtensionContext,
  mapleDiagnostics: vscode.DiagnosticCollection,
): void {
  if (vscode.window.activeTextEditor) {
    refreshDiagnostics(
      vscode.window.activeTextEditor.document,
      mapleDiagnostics,
    );
  }
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        refreshDiagnostics(editor.document, mapleDiagnostics);
      }
    }),
  );

  // Debounce per document so we don't re-parse the whole file on every keystroke
  const pendingRefreshes = new Map<string, NodeJS.Timeout>();

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const key = e.document.uri.toString();
      const pending = pendingRefreshes.get(key);
      if (pending) {
        clearTimeout(pending);
      }
      pendingRefreshes.set(
        key,
        setTimeout(() => {
          pendingRefreshes.delete(key);
          refreshDiagnostics(e.document, mapleDiagnostics);
        }, DIAGNOSTICS_DEBOUNCE_MS),
      );
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      const key = doc.uri.toString();
      const pending = pendingRefreshes.get(key);
      if (pending) {
        clearTimeout(pending);
        pendingRefreshes.delete(key);
      }
      mapleDiagnostics.delete(doc.uri);
    }),
  );

  context.subscriptions.push(
    new vscode.Disposable(() => {
      for (const timeout of pendingRefreshes.values()) {
        clearTimeout(timeout);
      }
      pendingRefreshes.clear();
    }),
  );
}
