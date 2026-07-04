import { ClassInstance } from '../LanguageService';
import {
  BaseLanguageService,
  InterpolationContext,
  InterpolationMatch,
} from './BaseLanguageService';

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
    context?: InterpolationContext,
  ): InterpolationMatch | undefined {
    // Angular/Twig interpolations: {{...}}
    if (value.substring(index, index + 2) === '{{') {
      // Balance from the first '{'; the second '{' nests, so the scan ends
      // just after the matching '}}'. String literals inside the expression
      // are skipped via the language-aware parseBalanced.
      const end = this.parseBalanced(value, index);
      if (end !== -1) {
        return {
          innerExprStart: index + 2, // The content inside {{
          innerExprEnd: end - 2, // Before the }}
          endIndex: end, // After the }}
        };
      }
    }
    return super.parseInterpolation(value, index, context);
  }
}
