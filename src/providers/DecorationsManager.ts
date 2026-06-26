import * as vscode from 'vscode';
import { MapleSemanticTokensProvider } from './SemanticTokensProvider';

export class DecorationsManager {
  private decorationTypes = new Map<number, vscode.TextEditorDecorationType>();
  private semanticProvider: MapleSemanticTokensProvider;
  private timeout: NodeJS.Timeout | undefined = undefined;
  private documentSelector: Array<string>;

  constructor(
    context: vscode.ExtensionContext,
    documentSelector: Array<string>,
  ) {
    this.semanticProvider = new MapleSemanticTokensProvider();
    this.documentSelector = documentSelector;

    // Initialize decoration types mapped to ANSI terminal colors for rich, theme-aware text highlighting
    // that won't be overwritten by Svelte/Vue semantic tokens.

    // 0: maple-mediaQuery
    this.decorationTypes.set(
      0,
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('terminal.ansiBrightMagenta'),
      }),
    );
    // 1: maple-utility
    this.decorationTypes.set(
      1,
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('terminal.ansiBrightCyan'),
      }),
    );
    // 2: maple-value
    this.decorationTypes.set(
      2,
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('terminal.ansiBrightGreen'),
      }),
    );
    // 3: maple-parent-selector
    this.decorationTypes.set(
      3,
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('terminal.ansiBrightBlue'),
      }),
    );
    // 4: maple-self-selector
    this.decorationTypes.set(
      4,
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('terminal.ansiBrightBlue'),
      }),
    );
    // 5: maple-child-selector
    this.decorationTypes.set(
      5,
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('terminal.ansiBrightBlue'),
      }),
    );
    // 6: maple-selector-operator
    this.decorationTypes.set(
      6,
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('terminal.ansiMagenta'),
      }),
    );
    // 7: maple-separator
    this.decorationTypes.set(
      7,
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('terminal.ansiMagenta'),
      }),
    );
    // 8: maple-underscore
    this.decorationTypes.set(
      8,
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('terminal.ansiMagenta'),
      }),
    );
    // 9: maple-alias
    this.decorationTypes.set(
      9,
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('terminal.ansiBrightYellow'),
      }),
    );
    // 10: maple-variable
    this.decorationTypes.set(
      10,
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('terminal.ansiBrightCyan'),
      }),
    );
    // 11: maple-important
    this.decorationTypes.set(
      11,
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('terminal.ansiBrightRed'),
      }),
    );
    // 12: maple-alias-param-key
    this.decorationTypes.set(
      12,
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('terminal.ansiBrightYellow'),
      }),
    );

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
    const document = editor.document;

    // Check if the document matches our supported languages
    if (!this.documentSelector.includes(document.languageId)) {
      return;
    }

    const token = new vscode.CancellationTokenSource().token;

    // Call the existing semantic token provider
    const semanticTokensResult =
      this.semanticProvider.provideDocumentSemanticTokens(document, token) as
        | vscode.SemanticTokens
        | undefined;

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
    for (const [tokenType, decorationType] of this.decorationTypes) {
      const ranges = rangesByType.get(tokenType) || [];
      editor.setDecorations(decorationType, ranges);
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
