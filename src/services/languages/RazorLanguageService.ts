import { ClassInstance } from '../LanguageService';
import { InterpolationMatch } from './BaseLanguageService';
import { parseBalancedCharacters } from './extractor-utils';
import { HtmlLanguageService } from './HtmlLanguageService';

export class RazorLanguageService extends HtmlLanguageService {
  languageIds = ['razor'];

  protected extractFrameworkSpecificClasses(
    text: string,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }>,
  ): void {
    super.extractFrameworkSpecificClasses(text, instances, disabledBlocks);
    // Standard classes and Razor interpolations inside them are handled by superclass
  }

  protected parseInterpolation(
    value: string,
    index: number,
  ): InterpolationMatch | undefined {
    // Razor interpolation: @(...)
    if (value.substring(index, index + 2) === '@(') {
      const end = parseBalancedCharacters(value, index + 2, '(', ')');
      if (end !== -1) {
        return {
          innerExprStart: index + 2,
          innerExprEnd: end - 1,
          endIndex: end,
        };
      }
    }

    // Razor interpolation: @xxx (wait, we didn't track this before, only @(...) and C# { ... })
    // C# string interpolation: { ... }
    if (value[index] === '{') {
      const end = parseBalancedCharacters(value, index + 1, '{', '}');
      if (end !== -1) {
        return {
          innerExprStart: index + 1,
          innerExprEnd: end - 1,
          endIndex: end,
        };
      }
    }

    return super.parseInterpolation(value, index);
  }
}
