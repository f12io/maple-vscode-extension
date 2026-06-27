import { ClassInstance } from '../LanguageService';
import { InterpolationMatch } from './BaseLanguageService';
import { HtmlLanguageService } from './HtmlLanguageService';

export class PhpLanguageService extends HtmlLanguageService {
  languageIds = ['php'];

  protected extractFrameworkSpecificClasses(
    text: string,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }>,
  ): void {
    super.extractFrameworkSpecificClasses(text, instances, disabledBlocks);
    // Standard classes and PHP interpolations inside them are handled by superclass
  }

  protected parseInterpolation(
    value: string,
    index: number,
  ): InterpolationMatch | undefined {
    // PHP interpolation: <? ... ?>
    if (value.substring(index, index + 2) === '<?') {
      const phpEnd = value.indexOf('?>', index + 2);
      if (phpEnd !== -1) {
        return {
          innerExprStart: index + 2,
          innerExprEnd: phpEnd,
          endIndex: phpEnd + 2,
        };
      }
    }
    return super.parseInterpolation(value, index);
  }
}
