import { findClosingQuote } from '../extractor.helper';
import { MapleRegion } from '../LanguageService';
import { ANGULAR_VUE_EXPR_REGEX } from '../regex';
import { HtmlLanguageService } from './HtmlLanguageService';

export class VueLanguageService extends HtmlLanguageService {
  languageIds = ['vue'];

  public collectRegions(text: string): Array<MapleRegion> {
    const regions = super.collectRegions(text);
    // Vue expressions: :class="..."
    for (const match of text.matchAll(ANGULAR_VUE_EXPR_REGEX)) {
      const quote = match[1];
      const exprStart = match.index + match[0].length;
      const closingQuoteIndex = findClosingQuote(text, exprStart, quote);
      if (closingQuoteIndex === -1) continue;

      regions.push({
        start: exprStart,
        end: closingQuoteIndex,
        kind: 'expression',
        anchor: match.index,
        includeObjectKeys: true,
        // The expression lives inside an HTML attribute; its JS strings
        // cannot span lines
        allowMultilineLiterals: false,
      });
    }
    return regions;
  }
}
