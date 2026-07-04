import { MapleRegion } from '../LanguageService';
import {
  JSX_EXPR_START_REGEX,
  SPECIFIC_CLASS_REGEX,
  UTILITY_FUNC_START_REGEX,
} from '../regex';
import {
  InterpolationContext,
  InterpolationMatch,
} from './BaseLanguageService';
import { HtmlLanguageService } from './HtmlLanguageService';

export class SvelteLanguageService extends HtmlLanguageService {
  languageIds = ['svelte'];

  public collectRegions(text: string): Array<MapleRegion> {
    const regions = super.collectRegions(text);

    // Svelte class directives: class:name="..."
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

    // Svelte class expressions class={...} and clsx/classNames/cva calls
    for (const regex of [JSX_EXPR_START_REGEX, UTILITY_FUNC_START_REGEX]) {
      for (const match of text.matchAll(regex)) {
        const openIndex = match.index + match[0].length - 1;
        const end = this.parseBalancedExpression(text, openIndex);
        if (end === -1) continue;
        regions.push({
          start: openIndex + 1,
          end: end - 1,
          kind: 'expression',
          anchor: match.index,
          includeObjectKeys: true,
        });
      }
    }
    return regions;
  }

  protected parseInterpolation(
    value: string,
    index: number,
    context?: InterpolationContext,
  ): InterpolationMatch | undefined {
    // Svelte interpolations inside class attribute: {isActive ? '...' : '...'}
    if (value[index] === '{') {
      const end = this.parseBalanced(value, index);
      if (end !== -1) {
        return {
          innerExprStart: index + 1,
          innerExprEnd: end - 1,
          endIndex: end,
        };
      }
    }
    return super.parseInterpolation(value, index, context);
  }

  protected skipStringAt(expr: string, index: number): number {
    // Svelte expressions may contain JS template literals
    if (expr[index] === '`') {
      return this.skipTemplateLiteral(expr, index);
    }
    return super.skipStringAt(expr, index);
  }
}
