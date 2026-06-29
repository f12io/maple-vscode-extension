import { getUtilityFuncStartRegex } from '../../constants/regex';
import {
  extractStringsFromBraces,
  parseBalancedCharacters,
} from '../../helpers/extractor.helper';
import { ClassInstance } from '../LanguageService';
import { BaseLanguageService, InterpolationMatch } from './BaseLanguageService';

export class JavascriptLanguageService extends BaseLanguageService {
  languageIds = ['javascript', 'typescript'];

  protected extractFrameworkSpecificClasses(
    text: string,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }>,
  ): void {
    this.extractStandardAttributes(text, instances, disabledBlocks);
    // Utility functions: clsx(...), classNames(...), cva(...)
    extractStringsFromBraces(
      text,
      getUtilityFuncStartRegex(),
      '(',
      ')',
      instances,
      disabledBlocks,
      (val: string, off: number, txt: string, idx: number) =>
        this.extractAttributeClasses(
          val,
          off,
          txt,
          idx,
          instances,
          disabledBlocks,
        ),
    );
  }

  protected parseInterpolation(
    value: string,
    index: number,
  ): InterpolationMatch | undefined {
    // JavaScript template literals: ${...}
    if (value.substring(index, index + 2) === '${') {
      const end = parseBalancedCharacters(value, index + 2, '{', '}');
      if (end !== -1) {
        return {
          innerExprStart: index + 2,
          innerExprEnd: end - 1,
          endIndex: end,
        };
      }
    }
    return super.parseInterpolation(value, index);
  }
}
