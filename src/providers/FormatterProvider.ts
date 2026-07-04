import {
  computeFormattingEdits,
  formatClasses as coreFormatClasses,
} from '@f12io/maple-language-core';
import * as vscode from 'vscode';
import { isExtensionExplicitlyDisabled } from '../helpers/config';
import { safeRun } from '../helpers/logger';
import { LanguageServiceRegistry } from '../services/LanguageServiceRegistry';

/**
 * Formats a maple class string. Thin wrapper over the core layout engine
 * that resolves the language service from a document or language id.
 */
export function formatClasses(
  classStr: string,
  baseIndent: string,
  maxClassesPerLine: number,
  languageId: string,
  document?: vscode.TextDocument,
): string {
  const service = document
    ? LanguageServiceRegistry.getServiceForDocument(document)
    : LanguageServiceRegistry.getService(languageId);
  if (!service) return classStr;
  return coreFormatClasses(classStr, baseIndent, maxClassesPerLine, service);
}

export function applyFormatting(
  document: vscode.TextDocument,
  maxClassesPerLine: number,
): Array<vscode.TextEdit> {
  return safeRun(
    'formatter',
    () => doApplyFormatting(document, maxClassesPerLine),
    [],
  );
}

function doApplyFormatting(
  document: vscode.TextDocument,
  maxClassesPerLine: number,
): Array<vscode.TextEdit> {
  const service = LanguageServiceRegistry.getServiceForDocument(document);
  if (!service) return [];

  const text = document.getText();
  return computeFormattingEdits(text, service, maxClassesPerLine).map((edit) =>
    vscode.TextEdit.replace(
      new vscode.Range(
        document.positionAt(edit.start),
        document.positionAt(edit.end),
      ),
      edit.newText,
    ),
  );
}

export function registerFormatterProvider(
  context: vscode.ExtensionContext,
  supportedLanguages: ReadonlyArray<string>,
) {
  // Register Manual Command
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      'maple.formatClasses',
      (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
        if (isExtensionExplicitlyDisabled()) return;

        const config = vscode.workspace.getConfiguration('maple');
        const isEnabled = config.get<boolean>('format.enabled');
        if (!isEnabled) return;

        const maxClassesPerLine = config.get<number>(
          'format.maxClassesPerLine',
        );
        if (maxClassesPerLine === undefined) return;

        const document = editor.document;
        if (!supportedLanguages.includes(document.languageId)) {
          vscode.window.showWarningMessage(
            'Maple: Formatting classes is not supported in this file type.',
          );
          return;
        }

        const edits = applyFormatting(document, maxClassesPerLine);

        if (edits.length > 0) {
          for (const textEdit of edits) {
            edit.replace(textEdit.range, textEdit.newText);
          }
          vscode.window.showInformationMessage(
            'Maple: Classes formatted successfully!',
          );
        } else {
          vscode.window.showInformationMessage(
            'Maple: No classes needed formatting.',
          );
        }
      },
    ),
  );

  // Register On Save Hook
  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument(
      (e: vscode.TextDocumentWillSaveEvent) => {
        if (isExtensionExplicitlyDisabled()) return;

        const config = vscode.workspace.getConfiguration('maple');
        const isEnabled = config.get<boolean>('format.enabled');
        const onSave = config.get<boolean>('format.onSave');

        if (!isEnabled || !onSave) return;

        const maxClassesPerLine = config.get<number>(
          'format.maxClassesPerLine',
        );
        if (maxClassesPerLine === undefined) return;

        const document = e.document;
        if (!supportedLanguages.includes(document.languageId)) return;

        const edits = applyFormatting(document, maxClassesPerLine);
        if (edits.length > 0) {
          e.waitUntil(Promise.resolve(edits));
        }
      },
    ),
  );
}
