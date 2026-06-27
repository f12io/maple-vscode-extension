import { ClassInstance, ILanguageService } from './LanguageService';
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

    // Deduplicate
    const uniqueInstances: Array<ClassInstance> = [];
    const seenStarts = new Set<number>();
    for (const instance of instances) {
      if (!seenStarts.has(instance.start)) {
        seenStarts.add(instance.start);
        uniqueInstances.push(instance);
      }
    }
    return uniqueInstances;
  }

  isInsideClassAttribute(text: string, offset: number): boolean {
    for (const service of this.services) {
      if (service.isInsideClassAttribute(text, offset)) return true;
    }
    return false;
  }

  tokenizeClassesWithIndices(str: string) {
    // The last service is usually the most specific one (e.g. PhpLanguageService over HtmlLanguageService)
    return this.services[this.services.length - 1].tokenizeClassesWithIndices(
      str,
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

  public static isSupported(languageId: string): boolean {
    return this.services.has(languageId);
  }
}
