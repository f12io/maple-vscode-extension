import {
  JSX_EXPR_START_REGEX,
  SPECIFIC_CLASS_REGEX,
  UTILITY_FUNC_START_REGEX,
} from '../../constants/regex';
import {
  extractStringsFromBraces,
  parseBalancedCharacters,
  pushInstance,
  shouldSkipMatch,
} from '../../helpers/extractor.helper';
import { ClassInstance } from '../LanguageService';
import { InterpolationMatch } from './BaseLanguageService';
import { HtmlLanguageService } from './HtmlLanguageService';

export class SvelteLanguageService extends HtmlLanguageService {
  languageIds = ['svelte'];

  protected extractFrameworkSpecificClasses(
    text: string,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }>,
  ): void {
    super.extractFrameworkSpecificClasses(text, instances, disabledBlocks);
    // Svelte class directives: class:name="..."
    for (const match of text.matchAll(SPECIFIC_CLASS_REGEX)) {
      if (shouldSkipMatch(text, match.index, disabledBlocks)) continue;

      const start = match.index + match[0].indexOf(match[1]);
      pushInstance(
        instances,
        match[1],
        start,
        text,
        match.index,
        disabledBlocks,
      );
    }

    // Svelte class expressions: class={...}
    extractStringsFromBraces(
      text,
      JSX_EXPR_START_REGEX,
      '{',
      '}',
      instances,
      disabledBlocks,
    );

    // Utility functions: clsx(...), classNames(...), cva(...)
    extractStringsFromBraces(
      text,
      UTILITY_FUNC_START_REGEX,
      '(',
      ')',
      instances,
      disabledBlocks,
    );
  }

  protected parseInterpolation(
    value: string,
    index: number,
  ): InterpolationMatch | undefined {
    // Svelte interpolations inside class attribute: {isActive ? '...' : '...'}
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
