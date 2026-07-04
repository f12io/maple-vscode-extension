import * as vscode from 'vscode';
import { SUPPORTED_LANGUAGES } from './constants/languages';
import { AliasCache } from './helpers/alias-cache';
import {
  isExtensionExplicitlyDisabled,
  isFeatureEnabled,
} from './helpers/config';
import { initLogger } from './helpers/logger';
import { MapleColorProvider } from './providers/ColorProvider';
import { MapleCompletionProvider } from './providers/CompletionProvider';
import { DecorationsManager } from './providers/DecorationsManager';
import {
  refreshDiagnostics,
  subscribeToDocumentChanges,
} from './providers/DiagnosticsProvider';
import { registerFormatterProvider } from './providers/FormatterProvider';
import { MapleHoverProvider } from './providers/HoverProvider';

const COMPLETION_TRIGGER_CHARACTERS = [
  '"',
  "'",
  ' ',
  '-',
  '|',
  '/',
  '@',
  ';',
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(
    '',
  ),
];

export function activate(context: vscode.ExtensionContext) {
  initLogger(context);
  AliasCache.init(context);

  const documentSelector: ReadonlyArray<string> = SUPPORTED_LANGUAGES;

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      documentSelector,
      new MapleHoverProvider(),
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      documentSelector,
      new MapleCompletionProvider(),
      ...COMPLETION_TRIGGER_CHARACTERS,
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
  registerFormatterProvider(context, documentSelector);

  const decorationsManager = new DecorationsManager(context, documentSelector);
  context.subscriptions.push(decorationsManager);

  const mapleDiagnostics = vscode.languages.createDiagnosticCollection('maple');
  context.subscriptions.push(mapleDiagnostics);
  subscribeToDocumentChanges(context, mapleDiagnostics);

  function refreshVisibleEditors() {
    for (const editor of vscode.window.visibleTextEditors) {
      refreshDiagnostics(editor.document, mapleDiagnostics);
      decorationsManager.updateDecorations(editor);
    }
  }

  context.subscriptions.push(
    AliasCache.onDidUpdateAliases.event(() => {
      if (isExtensionExplicitlyDisabled()) return;
      refreshVisibleEditors();
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('maple.enabled') ||
        e.affectsConfiguration('maple.features')
      ) {
        updateColorProvider();
        refreshVisibleEditors();
      }
    }),
  );
}

export function deactivate() {}
