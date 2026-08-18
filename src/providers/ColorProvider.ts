import {
  getColorPresentations,
  getDocumentColors,
} from '@f12io/maple-language-core';
import * as vscode from 'vscode';
import { isExtensionEnabled, isFeatureEnabled } from '../helpers/config';
import { isFileExcluded } from '../helpers/exclude';
import { safeRun } from '../helpers/logger';
import { LanguageServiceRegistry } from '../services/LanguageServiceRegistry';

export class MapleColorProvider implements vscode.DocumentColorProvider {
  public provideDocumentColors(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<Array<vscode.ColorInformation>> {
    return safeRun(
      'colorProvider',
      () => this.doProvideDocumentColors(document, token),
      [],
    );
  }

  private doProvideDocumentColors(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): Array<vscode.ColorInformation> {
    if (
      !isExtensionEnabled(document) ||
      isFileExcluded(document.uri) ||
      !isFeatureEnabled('colorPicker')
    )
      return [];

    const colors = getDocumentColors(document.getText(), {
      languageId: LanguageServiceRegistry.resolveLanguageId(document),
    });

    return colors.map(
      (span) =>
        new vscode.ColorInformation(
          toRange(document, span),
          new vscode.Color(
            span.color.red,
            span.color.green,
            span.color.blue,
            span.color.alpha,
          ),
        ),
    );
  }

  public provideColorPresentations(
    color: vscode.Color,
    context: { document: vscode.TextDocument; range: vscode.Range },
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<Array<vscode.ColorPresentation>> {
    return safeRun(
      'colorPresentations',
      () => this.doProvideColorPresentations(color, context, token),
      [],
    );
  }

  private doProvideColorPresentations(
    color: vscode.Color,
    context: { document: vscode.TextDocument; range: vscode.Range },
    _token: vscode.CancellationToken,
  ): Array<vscode.ColorPresentation> {
    const { document, range } = context;

    const presentations = getColorPresentations(
      document.getText(),
      {
        start: document.offsetAt(range.start),
        end: document.offsetAt(range.end),
      },
      color,
    );

    return presentations.map((presentation) => {
      const item = new vscode.ColorPresentation(presentation.label);
      // The edit can be wider than the picked range: swapping a bracketed
      // literal for a named color takes the brackets with it.
      item.textEdit = new vscode.TextEdit(
        toRange(document, presentation),
        presentation.insertText,
      );
      return item;
    });
  }
}

function toRange(
  document: vscode.TextDocument,
  span: { start: number; end: number },
): vscode.Range {
  return new vscode.Range(
    document.positionAt(span.start),
    document.positionAt(span.end),
  );
}
