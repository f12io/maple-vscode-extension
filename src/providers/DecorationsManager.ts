import * as vscode from 'vscode';
import { getHighlightingMode } from '../helpers/config';
import { safeRun } from '../helpers/logger';
import {
  MapleSemanticTokensProvider,
  semanticTokenIndexes,
} from './SemanticTokensProvider';

// Decoration colors mapped to ANSI terminal theme colors for rich, theme-aware
// text highlighting that won't be overwritten by Svelte/Vue semantic tokens.
const DECORATION_COLORS: Record<number, string> = {
  [semanticTokenIndexes.mapleMediaQuery]: 'terminal.ansiBrightMagenta',
  [semanticTokenIndexes.mapleUtility]: 'terminal.ansiBrightCyan',
  [semanticTokenIndexes.mapleValue]: 'terminal.ansiBrightGreen',
  [semanticTokenIndexes.mapleParentSelector]: 'terminal.ansiBrightBlue',
  [semanticTokenIndexes.mapleSelfSelector]: 'terminal.ansiBrightBlue',
  [semanticTokenIndexes.mapleChildSelector]: 'terminal.ansiBrightBlue',
  [semanticTokenIndexes.mapleSelectorOperator]: 'terminal.ansiMagenta',
  [semanticTokenIndexes.mapleSeparator]: 'terminal.ansiMagenta',
  [semanticTokenIndexes.mapleUnderscore]: 'terminal.ansiMagenta',
  [semanticTokenIndexes.mapleAlias]: 'terminal.ansiBrightYellow',
  [semanticTokenIndexes.mapleVariable]: 'terminal.ansiBrightCyan',
  [semanticTokenIndexes.mapleImportant]: 'terminal.ansiBrightRed',
  [semanticTokenIndexes.mapleAliasParamKey]: 'terminal.ansiBrightYellow',
};

export class DecorationsManager {
  private decorationTypes = new Map<number, vscode.TextEditorDecorationType>();
  private semanticProvider: MapleSemanticTokensProvider;
  private timeout: NodeJS.Timeout | undefined = undefined;
  private documentSelector: ReadonlyArray<string>;

  constructor(
    context: vscode.ExtensionContext,
    documentSelector: ReadonlyArray<string>,
  ) {
    this.semanticProvider = new MapleSemanticTokensProvider();
    this.documentSelector = documentSelector;

    for (const [tokenType, themeColor] of Object.entries(DECORATION_COLORS)) {
      this.decorationTypes.set(
        Number(tokenType),
        vscode.window.createTextEditorDecorationType({
          color: new vscode.ThemeColor(themeColor),
        }),
      );
    }

    // Register event listeners
    let activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      this.triggerUpdateDecorations(activeEditor);
    }

    vscode.window.onDidChangeActiveTextEditor(
      (editor) => {
        activeEditor = editor;
        if (editor) {
          this.triggerUpdateDecorations(editor);
        }
      },
      null,
      context.subscriptions,
    );

    vscode.workspace.onDidChangeTextDocument(
      (event) => {
        if (event.document === activeEditor?.document) {
          this.triggerUpdateDecorations(activeEditor, true);
        }
      },
      null,
      context.subscriptions,
    );
  }

  private triggerUpdateDecorations(
    editor: vscode.TextEditor,
    throttle = false,
  ) {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
    if (throttle) {
      this.timeout = setTimeout(() => this.updateDecorations(editor), 50);
    } else {
      this.updateDecorations(editor);
    }
  }

  public updateDecorations(editor: vscode.TextEditor) {
    safeRun('decorations', () => this.doUpdateDecorations(editor), undefined);
  }

  private doUpdateDecorations(editor: vscode.TextEditor) {
    const document = editor.document;

    // Check if the document matches our supported languages
    if (!this.documentSelector.includes(document.languageId)) {
      return;
    }

    const highlightingMode = getHighlightingMode();

    if (highlightingMode === 'off') {
      for (const decorationType of this.decorationTypes.values()) {
        editor.setDecorations(decorationType, []);
      }
      return;
    }

    const tokenSource = new vscode.CancellationTokenSource();

    // Call the existing semantic token provider
    const semanticTokensResult = this.semanticProvider.provideDocumentSemanticTokens(
      document,
      tokenSource.token,
    ) as vscode.SemanticTokens | undefined;
    tokenSource.dispose();

    if (!semanticTokensResult?.data || semanticTokensResult.data.length === 0) {
      // Clear decorations if no tokens are returned
      for (const decorationType of this.decorationTypes.values()) {
        editor.setDecorations(decorationType, []);
      }
      return;
    }

    const data = semanticTokensResult.data;
    const rangesByType = new Map<number, Array<vscode.Range>>();

    for (const key of this.decorationTypes.keys()) {
      rangesByType.set(key, []);
    }

    let currentLine = 0;
    let currentChar = 0;

    for (let i = 0; i < data.length; i += 5) {
      const deltaLine = data[i];
      const deltaChar = data[i + 1];
      const length = data[i + 2];
      const tokenType = data[i + 3];

      if (deltaLine > 0) {
        currentLine += deltaLine;
        currentChar = deltaChar;
      } else {
        currentChar += deltaChar;
      }

      const range = new vscode.Range(
        currentLine,
        currentChar,
        currentLine,
        currentChar + length,
      );

      const ranges = rangesByType.get(tokenType);
      if (ranges) {
        ranges.push(range);
      }
    }

    // Apply decorations
    if (highlightingMode === 'minimal') {
      const { mapleUtility, mapleValue, mapleAlias } = semanticTokenIndexes;
      const combinedValueRanges = [
        ...(rangesByType.get(mapleUtility) || []),
        ...(rangesByType.get(mapleValue) || []),
        ...(rangesByType.get(mapleAlias) || []),
      ];

      for (const [tokenType, decorationType] of this.decorationTypes) {
        if (tokenType === mapleValue) {
          editor.setDecorations(decorationType, combinedValueRanges);
        } else if (tokenType === mapleUtility || tokenType === mapleAlias) {
          editor.setDecorations(decorationType, []);
        } else {
          const ranges = rangesByType.get(tokenType) || [];
          editor.setDecorations(decorationType, ranges);
        }
      }
    } else {
      for (const [tokenType, decorationType] of this.decorationTypes) {
        const ranges = rangesByType.get(tokenType) || [];
        editor.setDecorations(decorationType, ranges);
      }
    }
  }

  public dispose() {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    for (const decorationType of this.decorationTypes.values()) {
      decorationType.dispose();
    }
  }
}
