import type { MapleDiagnostic } from '@f12io/maple-language-core';
import * as vscode from 'vscode';
import { isExtensionEnabled, isFeatureEnabled } from '../helpers/config';
import { isFileExcluded } from '../helpers/exclude';
import { safeRun } from '../helpers/logger';
import {
  getMapleDiagnostics,
  MAPLE_DIAGNOSTIC_SOURCE,
} from './DiagnosticsProvider';

/**
 * Quick fixes for the diagnostics this extension reports.
 *
 * Core decides what a correction is: `MapleDiagnostic.fix` holds the class
 * rewritten the way it was meant, and is only set when that is unambiguous.
 * The one case core deliberately leaves open is `conflicting-utility` — which
 * of the clashing classes to drop is a judgement call — so there the offer is
 * to remove the class the fix was invoked on, which is the user's own pick.
 */
export class MapleCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<Array<vscode.CodeAction>> {
    return safeRun(
      'codeActions',
      () => this.doProvideCodeActions(document, context, token),
      [],
    );
  }

  private doProvideCodeActions(
    document: vscode.TextDocument,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): Array<vscode.CodeAction> {
    if (
      !isExtensionEnabled(document) ||
      isFileExcluded(document.uri) ||
      !isFeatureEnabled('diagnostics') ||
      !isFeatureEnabled('quickFix')
    ) {
      return [];
    }

    const reported = context.diagnostics.filter(
      (diagnostic) => diagnostic.source === MAPLE_DIAGNOSTIC_SOURCE,
    );
    if (reported.length === 0) return [];

    const issues = getMapleDiagnostics(document);
    const actions: Array<vscode.CodeAction> = [];

    for (const diagnostic of reported) {
      const issue = findIssue(document, issues, diagnostic.range);
      if (!issue) continue;

      const action =
        issue.fix === undefined
          ? createRemoveAction(document, diagnostic, issue)
          : createReplaceAction(document, diagnostic, issue.fix);

      if (action) actions.push(action);
    }

    return actions;
  }
}

/** The core diagnostic a published `vscode.Diagnostic` came from. */
function findIssue(
  document: vscode.TextDocument,
  issues: ReadonlyArray<MapleDiagnostic>,
  range: vscode.Range,
): MapleDiagnostic | undefined {
  const start = document.offsetAt(range.start);
  const end = document.offsetAt(range.end);

  return issues.find((issue) => issue.start === start && issue.end === end);
}

function createReplaceAction(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  fix: string,
): vscode.CodeAction {
  const action = new vscode.CodeAction(
    `Replace with '${fix}'`,
    vscode.CodeActionKind.QuickFix,
  );
  action.edit = new vscode.WorkspaceEdit();
  action.edit.replace(document.uri, diagnostic.range, fix);
  action.diagnostics = [diagnostic];
  // Core only fills `fix` when the correction is unambiguous, so this is safe
  // to run from Auto Fix.
  action.isPreferred = true;

  return action;
}

function createRemoveAction(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  issue: MapleDiagnostic,
): vscode.CodeAction | undefined {
  if (issue.code !== 'conflicting-utility') return undefined;

  const cls = document.getText(diagnostic.range);
  const action = new vscode.CodeAction(
    `Remove '${cls}'`,
    vscode.CodeActionKind.QuickFix,
  );
  action.edit = new vscode.WorkspaceEdit();
  action.edit.delete(document.uri, removalRange(document, diagnostic.range));
  action.diagnostics = [diagnostic];
  // Removing the other participant is just as valid a resolution, so this must
  // not be applied by Auto Fix.
  action.isPreferred = false;

  return action;
}

/**
 * The class plus the whitespace that separated it from its neighbours, so
 * removing it does not leave a double space or a dangling blank line.
 *
 * The whitespace that follows goes first: it is the separator this class
 * introduced. Only when the class is the last one in its attribute — nothing
 * but the closing quote after it — is the leading whitespace taken instead,
 * which keeps a deliberate trailing space at a concatenation seam
 * (`'p-4 p-8 ' + extra`) intact.
 */
function removalRange(
  document: vscode.TextDocument,
  range: vscode.Range,
): vscode.Range {
  const text = document.getText();
  const start = document.offsetAt(range.start);
  const end = document.offsetAt(range.end);

  let trailing = end;
  while (trailing < text.length && /\s/.test(text[trailing])) trailing++;
  if (trailing > end) {
    return new vscode.Range(range.start, document.positionAt(trailing));
  }

  let leading = start;
  while (leading > 0 && /\s/.test(text[leading - 1])) leading--;

  return new vscode.Range(document.positionAt(leading), range.end);
}
