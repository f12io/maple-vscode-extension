import {
  LanguageServiceRegistry as CoreRegistry,
  getLanguageIdFromFileName,
  ILanguageService,
} from '@f12io/maple-language-core';
import * as vscode from 'vscode';

/**
 * VS Code-facing facade over the core language service registry, adding
 * document-based resolution (e.g. `.vue` files opened with the generic html
 * language mode resolve to the Vue service).
 */
export class LanguageServiceRegistry {
  public static getService(languageId: string): ILanguageService | undefined {
    return CoreRegistry.getService(languageId);
  }

  public static getServiceForDocument(
    doc: vscode.TextDocument,
  ): ILanguageService | undefined {
    let languageId = doc.languageId;

    if (languageId === 'html') {
      const fileName = doc.fileName || doc.uri?.fsPath || '';
      const extLanguageId = getLanguageIdFromFileName(fileName);
      if (
        extLanguageId &&
        extLanguageId !== 'html' &&
        CoreRegistry.isSupported(extLanguageId)
      ) {
        languageId = extLanguageId;
      }
    }

    return CoreRegistry.getService(languageId);
  }

  public static isSupported(languageId: string): boolean {
    return CoreRegistry.isSupported(languageId);
  }
}
