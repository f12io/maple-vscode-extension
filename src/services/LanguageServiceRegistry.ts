import * as vscode from 'vscode';
import { getLanguageIdFromFileName } from '../constants/languages';
import {
  ClassInstance,
  dedupeInstancesByStart,
  ILanguageService,
} from './LanguageService';
import { AngularLanguageService } from './languages/AngularLanguageService';
import { HtmlLanguageService } from './languages/HtmlLanguageService';
import { JavascriptLanguageService } from './languages/JavascriptLanguageService';
import { PhpLanguageService } from './languages/PhpLanguageService';
import { RazorLanguageService } from './languages/RazorLanguageService';
import { ReactLanguageService } from './languages/ReactLanguageService';
import { SvelteLanguageService } from './languages/SvelteLanguageService';
import { TwigLanguageService } from './languages/TwigLanguageService';
import { VueLanguageService } from './languages/VueLanguageService';

class CompositeLanguageService implements ILanguageService {
  languageIds: Array<string>;

  constructor(
    languageId: string,
    private services: Array<ILanguageService>,
  ) {
    this.languageIds = [languageId];
  }

  extractClasses(text: string): Array<ClassInstance> {
    const instances: Array<ClassInstance> = [];
    for (const service of this.services) {
      instances.push(...service.extractClasses(text));
    }

    return dedupeInstancesByStart(instances);
  }

  isInsideClassAttribute(text: string, offset: number): boolean {
    for (const service of this.services) {
      if (service.isInsideClassAttribute(text, offset)) return true;
    }
    return false;
  }

  getRenderedClassText(word: string): string {
    return this.services[this.services.length - 1].getRenderedClassText(word);
  }

  getMultilineStringDelimiters(
    rawQuote: string,
    content: string,
  ): { open: string; close: string } | undefined {
    return this.services[
      this.services.length - 1
    ].getMultilineStringDelimiters(rawQuote, content);
  }

  matchStringLiteral(text: string, index: number) {
    return this.services[this.services.length - 1].matchStringLiteral(
      text,
      index,
    );
  }

  formatExpression(
    expr: string,
    baseIndent: string,
    maxClassesPerLine: number,
    formatClassesFn: (
      value: string,
      indent: string,
      maxClasses: number,
    ) => string,
  ): string | undefined {
    return this.services[this.services.length - 1].formatExpression(
      expr,
      baseIndent,
      maxClassesPerLine,
      formatClassesFn,
    );
  }

  tokenizeClassesWithIndices(str: string) {
    // The last service is usually the most specific one (e.g. PhpLanguageService over HtmlLanguageService)
    return this.services[this.services.length - 1].tokenizeClassesWithIndices(
      str,
    );
  }

  formatInterpolation(
    cls: string,
    baseIndent: string,
    maxClassesPerLine: number,
    formatClassesFn: (
      value: string,
      indent: string,
      maxClasses: number,
    ) => string,
  ): string {
    return this.services[this.services.length - 1].formatInterpolation(
      cls,
      baseIndent,
      maxClassesPerLine,
      formatClassesFn,
    );
  }
}

export class LanguageServiceRegistry {
  private static services = new Map<string, Array<ILanguageService>>();

  static {
    this.register(new HtmlLanguageService());
    this.register(new JavascriptLanguageService());
    this.register(new PhpLanguageService());
    this.register(new RazorLanguageService());
    this.register(new ReactLanguageService());
    this.register(new SvelteLanguageService());
    this.register(new VueLanguageService());
    this.register(new AngularLanguageService());
    this.register(new TwigLanguageService());
  }

  private static register(service: ILanguageService) {
    for (const id of service.languageIds) {
      if (!this.services.has(id)) {
        this.services.set(id, []);
      }
      this.services.get(id)!.push(service);
    }
  }

  public static getService(languageId: string): ILanguageService | undefined {
    const services = this.services.get(languageId);
    if (!services || services.length === 0) return undefined;
    return new CompositeLanguageService(languageId, services);
  }

  public static getServiceForDocument(
    doc: vscode.TextDocument,
  ): ILanguageService | undefined {
    let languageId = doc.languageId;

    if (languageId === 'html') {
      const fileName = doc.fileName || doc.uri?.fsPath || '';
      const extLanguageId = getLanguageIdFromFileName(fileName);
      if (extLanguageId && extLanguageId !== 'html' && this.isSupported(extLanguageId)) {
        languageId = extLanguageId;
      }
    }

    return this.getService(languageId);
  }

  public static isSupported(languageId: string): boolean {
    return this.services.has(languageId);
  }
}
