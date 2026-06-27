import * as vscode from 'vscode';
import { SUPPORTED_LANGUAGES } from './constants/languages';
import { AliasCache } from './helpers/alias-cache';
import {
  isExtensionExplicitlyDisabled,
  isFeatureEnabled,
} from './helpers/config';
import { MapleColorProvider } from './providers/ColorProvider';
import { MapleCompletionProvider } from './providers/CompletionProvider';
import { DecorationsManager } from './providers/DecorationsManager';
import { subscribeToDocumentChanges } from './providers/DiagnosticsProvider';
import { registerFormatterProvider } from './providers/FormatterProvider';
import { MapleHoverProvider } from './providers/HoverProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "maple-vscode-extension" is now active!',
  );
  vscode.window.showInformationMessage('Maple Extension is now Active!');

  AliasCache.init(context);

  const documentSelector: vscode.DocumentSelector = SUPPORTED_LANGUAGES;

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      documentSelector,
      new MapleHoverProvider(),
    ),
  );

  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(
    '',
  );
  const numbers = '0123456789'.split('');

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      documentSelector,
      new MapleCompletionProvider(),
      ...['"', "'", ' ', '-', '|', '/', '@', ';', ...letters, ...numbers], // Trigger characters
    ),
  );

  let colorProviderDisposable: vscode.Disposable | undefined;

  function updateColorProvider() {
    const shouldBeEnabled =
      !isExtensionExplicitlyDisabled() && isFeatureEnabled('colorPicker');

    if (shouldBeEnabled && !colorProviderDisposable) {
      colorProviderDisposable = vscode.languages.registerColorProvider(
        documentSelector,
        new MapleColorProvider(),
      );
      context.subscriptions.push(colorProviderDisposable);
    } else if (!shouldBeEnabled && colorProviderDisposable) {
      colorProviderDisposable.dispose();

      // Remove from context.subscriptions to prevent memory leak
      const index = context.subscriptions.indexOf(colorProviderDisposable);
      if (index !== -1) {
        context.subscriptions.splice(index, 1);
      }

      colorProviderDisposable = undefined;
    }
  }

  // Initial registration
  updateColorProvider();
  registerFormatterProvider(context, documentSelector as Array<string>);

  const decorationsManager = new DecorationsManager(
    context,
    documentSelector as Array<string>,
  );
  context.subscriptions.push(decorationsManager);

  const mapleDiagnostics = vscode.languages.createDiagnosticCollection('maple');
  context.subscriptions.push(mapleDiagnostics);
  subscribeToDocumentChanges(context, mapleDiagnostics);
  context.subscriptions.push(
    AliasCache.onDidUpdateAliases.event(() => {
      if (isExtensionExplicitlyDisabled()) return;
      for (const editor of vscode.window.visibleTextEditors) {
        void import('./providers/DiagnosticsProvider').then(
          ({ refreshDiagnostics }) => {
            refreshDiagnostics(editor.document, mapleDiagnostics);
          },
        );
        decorationsManager.updateDecorations(editor);
      }
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('maple.enabled') ||
        e.affectsConfiguration('maple.features')
      ) {
        updateColorProvider();

        // Refresh diagnostics and highlighting for all visible editors
        for (const editor of vscode.window.visibleTextEditors) {
          void import('./providers/DiagnosticsProvider').then(
            ({ refreshDiagnostics }) => {
              refreshDiagnostics(editor.document, mapleDiagnostics);
            },
          );
          decorationsManager.updateDecorations(editor);
        }
      }
    }),
  );
}

export function deactivate() {}
