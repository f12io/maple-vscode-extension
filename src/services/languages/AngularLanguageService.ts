import {
  getAngularVueExprRegex,
  getHostClassRegex,
  getHostRegex,
  getSpecificClassRegex,
} from '../../constants/regex';
import { ClassInstance } from '../LanguageService';
import { BaseLanguageService } from './BaseLanguageService';
import {
  extractStringLiterals,
  findClosingQuote,
  pushInstance,
  shouldSkipMatch,
} from './extractor-utils';

export class AngularLanguageService extends BaseLanguageService {
  languageIds = ['html', 'typescript'];

  protected extractFrameworkSpecificClasses(
    text: string,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }>,
  ): void {
    // Angular expressions: [ngClass]="...", [class]="..."
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
          (val, off, txt, idx) =>
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
    }

    // Angular Host Bindings: host: { 'class': '...', '[class.xxx]': 'true' }
    const hostRegex = getHostRegex();
    while ((match = hostRegex.exec(text)) !== null) {
      if (shouldSkipMatch(text, match.index, disabledBlocks)) continue;

      const hostObj = match[1];
      const hostStart = match.index + match[0].indexOf(hostObj);

      const hostClassRegex = getHostClassRegex();
      let hcMatch;
      while ((hcMatch = hostClassRegex.exec(hostObj)) !== null) {
        const quoteIdx = hcMatch[0].indexOf(hcMatch[1]);
        const start = hostStart + hcMatch.index + quoteIdx + 1;
        this.extractAttributeClasses(
          hcMatch[2],
          start,
          text,
          match.index,
          instances,
          disabledBlocks,
        );
      }
    }

    // Angular [class.xxx]="..."
    const specificClassRegex = getSpecificClassRegex();
    while ((match = specificClassRegex.exec(text)) !== null) {
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
  }
}
