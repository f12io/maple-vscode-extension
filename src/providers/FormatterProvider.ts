import { parseClass } from '@f12io/maple';
import * as vscode from 'vscode';
import { INDENT_WHITESPACE_REGEX } from '../constants/regex';
import { isExtensionExplicitlyDisabled } from '../helpers/config';
import { safeRun } from '../helpers/logger';
import { LanguageServiceRegistry } from '../services/LanguageServiceRegistry';

function getIndentFromIndex(text: string, index: number): string {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  const lineText = text.substring(lineStart, index);
  const match = lineText.match(INDENT_WHITESPACE_REGEX);
  return match ? match[0] : '';
}

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
  const tokens = service.tokenizeClassesWithIndices(classStr);
  if (tokens.length === 0) return '';
  if (tokens.length <= 1 && maxClassesPerLine >= 1) {
    if (tokens.length === 1 && tokens[0].hasInterpolation) {
      // Do not return early, allow interpolation formatting
    } else {
      return tokens.length === 1 ? tokens[0].value : '';
    }
  }

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

    if (isExpression) {
      const formattedCls = service.formatInterpolation(
        cls,
        baseIndent,
        maxClassesPerLine,
        (value, indent, maxClasses) =>
          formatClasses(value, indent, maxClasses, languageId),
      );
      currentLine.push(formattedCls);
      currentLineHasExpression = true;
    } else {
      currentLine.push(cls);
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
  const edits: Array<vscode.TextEdit> = [];
  const text = document.getText();

  const service = LanguageServiceRegistry.getServiceForDocument(document);
  if (!service) return edits;

  const formatClassesFn = (value: string, indent: string, max: number) =>
    formatClasses(value, indent, max, document.languageId, document);

  // The same regions extraction consumes; when regions overlap (e.g.
  // /* maple */ clsx(...), or clsx inside a className expression) the
  // outermost one formats everything inside it.
  const regions = service.collectRegions(text);
  regions.sort((a, b) => a.start - b.start || b.end - a.end);
  let lastKeptEnd = -1;

  for (const region of regions) {
    if (region.start < lastKeptEnd) continue;
    lastKeptEnd = region.end;

    const allowMultiline = region.allowMultilineLiterals !== false;
    const baseIndent = getIndentFromIndex(text, region.anchor);

    if (region.kind === 'class-text') {
      const innerString = text.substring(region.start, region.end);
      const formatted = formatClassesFn(
        innerString,
        baseIndent,
        maxClassesPerLine,
      );
      if (formatted === innerString) continue;
      if (formatted.includes('\n') && !allowMultiline) continue;

      const range = new vscode.Range(
        document.positionAt(region.start),
        document.positionAt(region.end),
      );
      edits.push(vscode.TextEdit.replace(range, formatted));
      continue;
    }

    // Expression regions: structured expressions (ternaries, concatenations)
    // get the same treatment as interpolations inside class attributes.
    const regionText = text.substring(region.start, region.end).trim();
    const regionTextStart =
      region.start + text.substring(region.start, region.end).indexOf(regionText);
    const structured = service.formatExpression(
      regionText,
      baseIndent,
      maxClassesPerLine,
      formatClassesFn,
    );
    if (structured !== undefined) {
      if (
        structured !== regionText &&
        (allowMultiline || !structured.includes('\n'))
      ) {
        const range = new vscode.Range(
          document.positionAt(regionTextStart),
          document.positionAt(regionTextStart + regionText.length),
        );
        edits.push(vscode.TextEdit.replace(range, structured));
      }
      continue;
    }

    // Otherwise format each string literal on its own.
    let i = region.start;
    while (i < region.end) {
      const literal = service.matchStringLiteral(text, i);
      if (!literal) {
        i++;
        continue;
      }
      i = literal.endIndex;

      const innerString = text.substring(
        literal.contentStart,
        literal.contentEnd,
      );

      const formatted = formatClassesFn(
        innerString,
        baseIndent,
        maxClassesPerLine,
      );
      if (formatted === innerString) continue;

      // Keep the original delimiters for single-line results; multi-line
      // results need delimiters that legally contain newlines (or none
      // exist and the string is left untouched).
      let open = literal.rawDelimiter;
      let close =
        literal.rawDelimiter === '`' ? '`' : literal.rawDelimiter.slice(-1);
      if (formatted.includes('\n')) {
        if (!allowMultiline) continue;
        const delimiters = service.getMultilineStringDelimiters(
          literal.rawDelimiter,
          innerString,
        );
        if (!delimiters) continue;
        open = delimiters.open;
        close = delimiters.close;
      }

      const range = new vscode.Range(
        document.positionAt(literal.start),
        document.positionAt(literal.endIndex),
      );
      edits.push(vscode.TextEdit.replace(range, open + formatted + close));
    }
  }

  return edits;
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
