import { getDiagnostics } from '@f12io/maple-language-core';
import * as vscode from 'vscode';
import { AliasCache } from '../helpers/alias-cache';
import { isExtensionEnabled, isFeatureEnabled } from '../helpers/config';
import { isFileExcluded } from '../helpers/exclude';
import { safeRun } from '../helpers/logger';
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

  const toRange = (span: { start: number; end: number }) =>
    new vscode.Range(doc.positionAt(span.start), doc.positionAt(span.end));

  const issues = getDiagnostics(doc.getText(), {
    languageId: LanguageServiceRegistry.resolveLanguageId(doc),
    localAliases: AliasCache.getAliases(doc.uri),
  });

  const diagnostics = issues.map((issue) => {
    const diagnostic = new vscode.Diagnostic(
      toRange(issue),
      issue.message,
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = 'Maple';
    diagnostic.code = issue.code;

    // A conflict is reported on every class taking part in it, so each one
    // points at the others.
    if (issue.related) {
      diagnostic.relatedInformation = issue.related.map(
        (span) =>
          new vscode.DiagnosticRelatedInformation(
            new vscode.Location(doc.uri, toRange(span)),
            issue.message,
          ),
      );
    }

    return diagnostic;
  });

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
