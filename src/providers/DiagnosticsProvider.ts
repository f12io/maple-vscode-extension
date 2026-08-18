import {
  getDiagnostics,
  type MapleDiagnostic,
} from '@f12io/maple-language-core';
import * as vscode from 'vscode';
import { AliasCache } from '../helpers/alias-cache';
import { isExtensionEnabled, isFeatureEnabled } from '../helpers/config';
import { isFileExcluded } from '../helpers/exclude';
import { safeRun } from '../helpers/logger';
import { LanguageServiceRegistry } from '../services/LanguageServiceRegistry';

/** Delay before re-linting a document after the user stops typing. */
const DIAGNOSTICS_DEBOUNCE_MS = 250;

/** Marks the diagnostics this extension owns, so quick fixes can find them. */
export const MAPLE_DIAGNOSTIC_SOURCE = 'Maple';

/** The core results behind the diagnostics published for one document. */
interface CachedDiagnostics {
  version: number;
  issues: Array<MapleDiagnostic>;
}

/**
 * The last core result per document. VS Code hands `vscode.Diagnostic` copies
 * back to a code action provider, so the `fix` a quick fix needs cannot ride
 * along on the diagnostic itself and is looked up here by offset instead.
 */
const diagnosticsCache = new Map<string, CachedDiagnostics>();

function computeDiagnostics(doc: vscode.TextDocument): Array<MapleDiagnostic> {
  if (
    !isExtensionEnabled(doc) ||
    isFileExcluded(doc.uri) ||
    !isFeatureEnabled('diagnostics')
  ) {
    return [];
  }

  return getDiagnostics(doc.getText(), {
    languageId: LanguageServiceRegistry.resolveLanguageId(doc),
    localAliases: AliasCache.getAliases(doc.uri),
  });
}

function computeAndCache(doc: vscode.TextDocument): Array<MapleDiagnostic> {
  const issues = computeDiagnostics(doc);
  diagnosticsCache.set(doc.uri.toString(), { version: doc.version, issues });
  return issues;
}

/**
 * The core diagnostics for `doc` as of its current version, reusing the last
 * lint when the document has not changed since. Recomputes rather than
 * returning stale spans, so a quick fix requested inside the typing debounce
 * still edits the right range.
 */
export function getMapleDiagnostics(
  doc: vscode.TextDocument,
): Array<MapleDiagnostic> {
  const cached = diagnosticsCache.get(doc.uri.toString());
  if (cached?.version === doc.version) return cached.issues;

  return computeAndCache(doc);
}

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
  const toRange = (span: { start: number; end: number }) =>
    new vscode.Range(doc.positionAt(span.start), doc.positionAt(span.end));

  // Always recompute: the feature gates can flip without the document
  // changing, which would leave a cached result behind.
  const issues = computeAndCache(doc);

  const diagnostics = issues.map((issue) => {
    const diagnostic = new vscode.Diagnostic(
      toRange(issue),
      issue.message,
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = MAPLE_DIAGNOSTIC_SOURCE;
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
      diagnosticsCache.delete(key);
      mapleDiagnostics.delete(doc.uri);
    }),
  );

  context.subscriptions.push(
    new vscode.Disposable(() => {
      for (const timeout of pendingRefreshes.values()) {
        clearTimeout(timeout);
      }
      pendingRefreshes.clear();
      diagnosticsCache.clear();
    }),
  );
}
