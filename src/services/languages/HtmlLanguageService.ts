import { ClassInstance } from '../LanguageService';
import { BaseLanguageService, InterpolationMatch } from './BaseLanguageService';
import { parseBalancedCharacters } from './extractor-utils';

export class HtmlLanguageService extends BaseLanguageService {
  languageIds = ['html'];

  protected extractFrameworkSpecificClasses(
    text: string,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }>,
  ): void {
    // Angular logic moved to AngularLanguageService
  }

  protected parseInterpolation(
    value: string,
    index: number,
  ): InterpolationMatch | undefined {
    // Angular/Twig interpolations: {{...}}
    if (value.substring(index, index + 2) === '{{') {
      // Start tracking after the first '{' so count is 1. The second '{' will increment count to 2.
      const end = parseBalancedCharacters(value, index + 1, '{', '}');
      if (end !== -1) {
        return {
          innerExprStart: index + 2, // The content inside {{
          innerExprEnd: end - 2, // Before the }}
          endIndex: end, // After the }}
        };
      }
    }
    return super.parseInterpolation(value, index);
  }
}
