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
    return CoreRegistry.getService(this.resolveLanguageId(doc));
  }

  /**
   * The language id core should be asked for. Needed on its own by the APIs
   * that take a language id rather than a service.
   */
  public static resolveLanguageId(doc: vscode.TextDocument): string {
    const languageId = doc.languageId;

    if (languageId === 'html') {
      const fileName = doc.fileName || doc.uri?.fsPath || '';
      const extLanguageId = getLanguageIdFromFileName(fileName);
      if (
        extLanguageId &&
        extLanguageId !== 'html' &&
        CoreRegistry.isSupported(extLanguageId)
      ) {
        return extLanguageId;
      }
    }

    return languageId;
  }

  public static isSupported(languageId: string): boolean {
    return CoreRegistry.isSupported(languageId);
  }
}
