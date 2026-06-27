import { getAngularVueExprRegex } from '../../constants/regex';
import { ClassInstance } from '../LanguageService';
import { HtmlLanguageService } from './HtmlLanguageService';
import {
  extractStringLiterals,
  extractUnquotedObjectKeys,
  findClosingQuote,
  shouldSkipMatch,
} from './extractor-utils';

export class VueLanguageService extends HtmlLanguageService {
  languageIds = ['vue'];

  protected extractFrameworkSpecificClasses(
    text: string,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }>,
  ): void {
    super.extractFrameworkSpecificClasses(text, instances, disabledBlocks);
    // Vue expressions: :class="..."
    const exprRegex = getAngularVueExprRegex();
    let match;
    while ((match = exprRegex.exec(text)) !== null) {
      if (shouldSkipMatch(text, match.index, disabledBlocks)) continue;

      const quote = match[1];
      const exprStart = match.index + match[0].length;
      const closingQuoteIndex = findClosingQuote(text, exprStart, quote);

      if (closingQuoteIndex !== -1) {
        const expr = text.substring(exprStart, closingQuoteIndex);
        extractStringLiterals(
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
