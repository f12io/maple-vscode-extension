import { JSX_EXPR_START_REGEX } from '../../constants/regex';
import { MapleRegion } from '../LanguageService';
import { JavascriptLanguageService } from './JavascriptLanguageService';

export class ReactLanguageService extends JavascriptLanguageService {
  languageIds = ['javascriptreact', 'typescriptreact'];

  public collectRegions(text: string): Array<MapleRegion> {
    const regions = super.collectRegions(text);
    // React / Solid JSX expressions: className={...}, class={...}, classList={...}
    for (const match of text.matchAll(JSX_EXPR_START_REGEX)) {
      const openBrace = match.index + match[0].length - 1;
      const end = this.parseBalancedExpression(text, openBrace);
      if (end === -1) continue;
      regions.push({
        start: openBrace + 1,
        end: end - 1,
        kind: 'expression',
        anchor: match.index,
        includeObjectKeys: true,
      });
    }
    return regions;
  }
}
