import {
  MAPLE_TOKEN_THEME_COLORS,
  MAPLE_TOKEN_TYPES,
  type MapleTokenType,
} from '@f12io/maple-language-core';
import * as vscode from 'vscode';
import { getColorOverride, getHighlightingMode } from '../helpers/config';
import { safeRun } from '../helpers/logger';
import {
  getDocumentSemanticTokens,
  getTokenTypeIndex,
  semanticTokenIndexes,
} from './SemanticTokensProvider';

/**
 * The color to paint a token type with: the user's `maple.colors.<token>`
 * override when set, otherwise core's palette. A `#rrggbb` override is used
 * literally; anything else is read as a theme color id, so a workspace can
 * point a token at any color in the current theme.
 */
function resolveColor(type: MapleTokenType): string | vscode.ThemeColor {
  const override = getColorOverride(type);
  const color = override || MAPLE_TOKEN_THEME_COLORS[type];

  return color.startsWith('#') ? color : new vscode.ThemeColor(color);
}

export class DecorationsManager {
  private decorationTypes = new Map<number, vscode.TextEditorDecorationType>();
  private timeout: NodeJS.Timeout | undefined = undefined;
  private pendingDocuments = new Set<vscode.TextDocument>();
  private documentSelector: ReadonlyArray<string>;

  constructor(
    context: vscode.ExtensionContext,
    documentSelector: ReadonlyArray<string>,
  ) {
    this.documentSelector = documentSelector;

    this.buildDecorationTypes();

    // Decorations live on a TextEditor, not on a document, so every visible
    // editor needs its own pass. A diff view is two editors showing two
    // documents side by side, and neither side is guaranteed to be the active
    // editor - tracking only the active one leaves the other pane unpainted.
    this.updateVisibleEditors();

    vscode.window.onDidChangeVisibleTextEditors(
      (editors) => {
        for (const editor of editors) {
          this.updateDecorations(editor);
        }
      },
      null,
      context.subscriptions,
    );

    vscode.workspace.onDidChangeTextDocument(
      (event) => {
        this.scheduleDocumentUpdate(event.document);
      },
      null,
      context.subscriptions,
    );
  }

  /**
   * Creates one decoration type per token type from the current palette.
   * Decorations are painted for every supported language and always win over
   * semantic token colors, so this is the only place a token's color is
   * decided.
   */
  private buildDecorationTypes() {
    for (const type of MAPLE_TOKEN_TYPES) {
      this.decorationTypes.set(
        getTokenTypeIndex(type),
        vscode.window.createTextEditorDecorationType({
          color: resolveColor(type),
        }),
      );
    }
  }

  /**
   * Rebuilds the palette after `maple.colors` changes. A decoration type's
   * color is fixed at creation, so overrides only take effect by disposing the
   * old types and painting again.
   */
  public reloadColors() {
    for (const decorationType of this.decorationTypes.values()) {
      decorationType.dispose();
    }
    this.decorationTypes.clear();
    this.buildDecorationTypes();
    this.updateVisibleEditors();
  }

  /**
   * Repaints every editor currently on screen, including both panes of a diff.
   */
  public updateVisibleEditors() {
    for (const editor of vscode.window.visibleTextEditors) {
      this.updateDecorations(editor);
    }
  }

  /**
   * Coalesces rapid edits into a single pass. Editors are resolved when the
   * timer fires rather than when it is scheduled, so an editor closed in the
   * meantime is never decorated after disposal.
   */
  private scheduleDocumentUpdate(document: vscode.TextDocument) {
    this.pendingDocuments.add(document);

    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    this.timeout = setTimeout(() => {
      this.timeout = undefined;
      const documents = this.pendingDocuments;
      this.pendingDocuments = new Set();

      for (const editor of vscode.window.visibleTextEditors) {
        if (documents.has(editor.document)) {
          this.updateDecorations(editor);
        }
      }
    }, 50);
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

    const tokens = getDocumentSemanticTokens(document);

    if (tokens.length === 0) {
      // Clear decorations if no tokens are returned
      for (const decorationType of this.decorationTypes.values()) {
        editor.setDecorations(decorationType, []);
      }
      return;
    }

    const rangesByType = new Map<number, Array<vscode.Range>>();

    for (const key of this.decorationTypes.keys()) {
      rangesByType.set(key, []);
    }

    for (const token of tokens) {
      const ranges = rangesByType.get(getTokenTypeIndex(token.type));
      if (ranges) {
        ranges.push(
          new vscode.Range(
            document.positionAt(token.start),
            document.positionAt(token.start + token.length),
          ),
        );
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
