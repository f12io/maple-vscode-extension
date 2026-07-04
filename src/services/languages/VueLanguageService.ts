import { ANGULAR_VUE_EXPR_REGEX } from '../../constants/regex';
import {
  extractStringLiterals,
  extractUnquotedObjectKeys,
  findClosingQuote,
  shouldSkipMatch,
} from '../../helpers/extractor.helper';
import { ClassInstance } from '../LanguageService';
import { HtmlLanguageService } from './HtmlLanguageService';

export class VueLanguageService extends HtmlLanguageService {
  languageIds = ['vue'];

  protected extractFrameworkSpecificClasses(
    text: string,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }>,
  ): void {
    super.extractFrameworkSpecificClasses(text, instances, disabledBlocks);
    // Vue expressions: :class="..."
    for (const match of text.matchAll(ANGULAR_VUE_EXPR_REGEX)) {
      if (shouldSkipMatch(text, match.index, disabledBlocks)) continue;

      const quote = match[1];
      const exprStart = match.index + match[0].length;
      const closingQuoteIndex = findClosingQuote(text, exprStart, quote);

      if (closingQuoteIndex !== -1) {
        const expr = text.substring(exprStart, closingQuoteIndex);
        extractStringLiterals(
          this,
          expr,
          exprStart,
          text,
          match.index,
          instances,
          disabledBlocks,
        );
        extractUnquotedObjectKeys(
          expr,
          exprStart,
          text,
          match.index,
          instances,
          disabledBlocks,
        );
      }
    }
  }
}
