import {
  ANGULAR_VUE_EXPR_REGEX,
  HOST_CLASS_REGEX,
  HOST_REGEX,
  SPECIFIC_CLASS_REGEX,
} from '../../constants/regex';
import {
  extractStringLiterals,
  findClosingQuote,
  pushInstance,
  shouldSkipMatch,
} from '../../helpers/extractor.helper';
import { ClassInstance } from '../LanguageService';
import { BaseLanguageService } from './BaseLanguageService';

export class AngularLanguageService extends BaseLanguageService {
  languageIds = ['html', 'typescript'];

  protected extractFrameworkSpecificClasses(
    text: string,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }>,
  ): void {
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
          (val, off, txt, idx, literal) =>
            this.extractAttributeClasses(
              val,
              off,
              txt,
              idx,
              instances,
              disabledBlocks,
              literal?.rawDelimiter,
            ),
        );
      }
    }

    for (const match of text.matchAll(HOST_REGEX)) {
      if (shouldSkipMatch(text, match.index, disabledBlocks)) continue;

      const hostObj = match[1];
      const hostStart = match.index + match[0].indexOf(hostObj);

      for (const hcMatch of hostObj.matchAll(HOST_CLASS_REGEX)) {
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
  }
}
