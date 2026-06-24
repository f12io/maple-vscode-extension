import {
  buildRule,
  BUILTIN_ALIASES,
  COLOR_MAX_TONE,
  COLOR_MIN_TONE,
  PROP_TYPE_COLOR,
} from '@f12io/maple';
import * as vscode from 'vscode';
import { AliasCache } from '../helpers/alias-cache';
import { extractAllClasses } from '../helpers/class-extractor';
import { getMapleClassRegex } from '../constants/regex';
import { isExtensionEnabled } from '../helpers/config';
import { isFileExcluded } from '../helpers/exclude';
import {
  checkConverted,
  getAliasName,
  isAliasDefinition,
  isAliasMarker,
  parseMapleToken,
  stripQuotes,
} from '../helpers/maple-parser';

export function refreshDiagnostics(
  doc: vscode.TextDocument,
  mapleDiagnostics: vscode.DiagnosticCollection,
): void {
  if (!isExtensionEnabled() || isFileExcluded(doc.uri)) {
    mapleDiagnostics.set(doc.uri, []);
    return;
  }

  const diagnostics: Array<vscode.Diagnostic> = [];
  const text = doc.getText();

  const classInstances = extractAllClasses(text);

  for (const instance of classInstances) {
    const classValue = instance.value;
    const seenSelectors = new Map<
      string,
      { range: vscode.Range; isAdded: boolean }
    >();

    const mapleClassRegex = getMapleClassRegex();
    let wordMatch;
    while ((wordMatch = mapleClassRegex.exec(classValue))) {
      let cls = wordMatch[0];

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
        } else if (isAliasDefinition(activeWord) && activeWord.includes('=')) {
          if (instance.tagName && instance.tagName !== 'html') {
            hasError = true;
            errorMsg = `Maple aliases can only be defined on the 'html' element. Found on '${instance.tagName}'.`;
          }
        } else if (!converted) {
          // Check if it's a valid alias before flagging as invalid
          const rawAliasBase = activeWord
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
            hasError = true;
            errorMsg = `Invalid maple class: '${cls}'`;
          }
        }
      }

      if (hasError) {
        const startIdx = instance.start + wordMatch.index;
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
            const startIdx = instance.start + wordMatch.index;
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

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) =>
      refreshDiagnostics(e.document, mapleDiagnostics),
    ),
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) =>
      mapleDiagnostics.delete(doc.uri),
    ),
  );
}
