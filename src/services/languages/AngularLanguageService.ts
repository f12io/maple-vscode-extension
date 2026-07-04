import {
  ANGULAR_VUE_EXPR_REGEX,
  HOST_CLASS_REGEX,
  HOST_REGEX,
  SPECIFIC_CLASS_REGEX,
} from '../../constants/regex';
import { findClosingQuote } from '../../helpers/extractor.helper';
import { MapleRegion } from '../LanguageService';
import { BaseLanguageService } from './BaseLanguageService';

export class AngularLanguageService extends BaseLanguageService {
  languageIds = ['html', 'typescript'];

  public collectRegions(text: string): Array<MapleRegion> {
    // Note: the base attribute/opt-in regions are contributed by
    // HtmlLanguageService in the same composite; this service adds only the
    // Angular-specific constructs.
    const regions: Array<MapleRegion> = [];

    // Template expressions: [ngClass]="...", [class.x]="..."
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
        // Angular template expressions support neither template literals nor
        // multi-line strings
        allowMultilineLiterals: false,
      });
    }

    // Component decorators: host: { class: '...' }
    for (const match of text.matchAll(HOST_REGEX)) {
      const hostObj = match[1];
      const hostStart = match.index + match[0].indexOf(hostObj);

      for (const hcMatch of hostObj.matchAll(HOST_CLASS_REGEX)) {
        const quoteIdx = hcMatch[0].indexOf(hcMatch[1]);
        const start = hostStart + hcMatch.index + quoteIdx + 1;
        regions.push({
          start,
          end: start + hcMatch[2].length,
          kind: 'class-text',
          anchor: match.index,
          // The class list lives inside a TS string literal
          allowMultilineLiterals: false,
        });
      }
    }

    // Specific class bindings: [class.name]
    for (const match of text.matchAll(SPECIFIC_CLASS_REGEX)) {
      const start = match.index + match[0].indexOf(match[1]);
      regions.push({
        start,
        end: start + match[1].length,
        kind: 'class-text',
        anchor: match.index,
        allowMultilineLiterals: false,
      });
    }

    return regions;
  }
}
