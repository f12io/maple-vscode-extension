import { parseClass } from '@f12io/maple';
import * as vscode from 'vscode';
import {
  CLASS_ATTR_REGEX,
  INDENT_WHITESPACE_REGEX,
  MAPLE_TAG_REGEX,
} from '../constants/regex';
import { isExtensionExplicitlyDisabled } from '../helpers/config';
import { LanguageServiceRegistry } from '../services/LanguageServiceRegistry';

function getIndentFromIndex(text: string, index: number): string {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  const lineText = text.substring(lineStart, index);
  const match = lineText.match(INDENT_WHITESPACE_REGEX);
  return match ? match[0] : '';
}

function formatClasses(
  classStr: string,
  baseIndent: string,
  maxClassesPerLine: number,
  languageId: string,
): string {
  const service = LanguageServiceRegistry.getService(languageId);
  if (!service) return classStr;
  const tokens = service.tokenizeClassesWithIndices(classStr);
  if (tokens.length === 0) return '';
  if (tokens.length <= 1 && maxClassesPerLine >= 1) return tokens[0].value;

  const lines: Array<Array<string>> = [];
  let currentLine: Array<string> = [];
  let currentLineHasExpression = false;
  let lastPropType: number | null = null;

  for (const token of tokens) {
    const cls = token.value;
    let propType = -1;
    try {
      const parsed = parseClass(cls);
      propType = parsed?.propType ?? -1;
    } catch (ignoreError) {
      propType = -1;
    }

    const isNewType =
      tokens.length > maxClassesPerLine &&
      lastPropType !== null &&
      lastPropType !== propType;
    const isOverLimit = currentLine.length >= maxClassesPerLine;
    const isExpression = token.hasInterpolation;

    if (
      currentLine.length > 0 &&
      (isNewType || isOverLimit || isExpression || currentLineHasExpression)
    ) {
      lines.push(currentLine);
      currentLine = [];
      currentLineHasExpression = false;
    }

    currentLine.push(cls);
    if (isExpression) {
      currentLineHasExpression = true;
    }
    lastPropType = propType;
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  if (lines.length === 1) {
    return lines[0].join(' ');
  }

  const indent = baseIndent + '  ';
  const formatted =
    '\n' +
    lines.map((line) => indent + line.join(' ')).join('\n') +
    '\n' +
    baseIndent;

  return formatted;
}

function applyFormatting(
  document: vscode.TextDocument,
  maxClassesPerLine: number,
): Array<vscode.TextEdit> {
  const edits: Array<vscode.TextEdit> = [];
  const text = document.getText();

  for (const match of text.matchAll(CLASS_ATTR_REGEX)) {
    const fullMatch = match[0];
    const quote = match[1];
    const innerString = match[2];
    const innerStart = match.index + fullMatch.indexOf(quote) + 1;
    const innerEnd = innerStart + innerString.length;

    const baseIndent = getIndentFromIndex(text, match.index);
    const formatted = formatClasses(
      innerString,
      baseIndent,
      maxClassesPerLine,
      document.languageId,
    );

    if (formatted !== innerString) {
      const range = new vscode.Range(
        document.positionAt(innerStart),
        document.positionAt(innerEnd),
      );
      edits.push(vscode.TextEdit.replace(range, formatted));
    }
  }

  for (const match of text.matchAll(MAPLE_TAG_REGEX)) {
    const fullMatch = match[0];
    const innerString = match[1];

    const innerStart = match.index + fullMatch.indexOf('`') + 1;
    const innerEnd = innerStart + innerString.length;

    const baseIndent = getIndentFromIndex(text, match.index);
    const formatted = formatClasses(
      innerString,
      baseIndent,
      maxClassesPerLine,
      document.languageId,
    );

    if (formatted !== innerString) {
      const range = new vscode.Range(
        document.positionAt(innerStart),
        document.positionAt(innerEnd),
      );
      edits.push(vscode.TextEdit.replace(range, formatted));
    }
  }

  return edits;
}

export function registerFormatterProvider(
  context: vscode.ExtensionContext,
  supportedLanguages: Array<string>,
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
