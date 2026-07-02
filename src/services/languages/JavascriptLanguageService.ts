import { UTILITY_FUNC_START_REGEX } from '../../constants/regex';
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
      UTILITY_FUNC_START_REGEX,
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

  protected skipStringAt(expr: string, index: number): number {
    if (expr[index] === '`') {
      let j = index + 1;
      while (j < expr.length) {
        if (expr[j] === '\\') {
          j += 2;
          continue;
        }
        if (expr[j] === '$' && expr[j + 1] === '{') {
          j += 2;
          let braceDepth = 1;
          while (j < expr.length && braceDepth > 0) {
            const se = this.skipStringAt(expr, j);
            if (se > j) {
              j = se;
              continue;
            }
            if (expr[j] === '{') braceDepth++;
            else if (expr[j] === '}') braceDepth--;
            if (braceDepth > 0) j++;
          }
          if (j < expr.length) j++; // skip closing }
          continue;
        }
        if (expr[j] === '`') return j + 1;
        j++;
      }
      return expr.length;
    }
    return super.skipStringAt(expr, index);
  }

  public formatInterpolation(
    cls: string,
    baseIndent: string,
    maxClassesPerLine: number,
    formatClassesFn: (
      value: string,
      indent: string,
      maxClasses: number,
    ) => string,
  ): string {
    const startIndex = cls.indexOf('${');
    if (startIndex === -1) {
      return super.formatInterpolation(
        cls,
        baseIndent,
        maxClassesPerLine,
        formatClassesFn,
      );
    }
    const end = parseBalancedCharacters(cls, startIndex + 2, '{', '}');
    if (end === -1) {
      return super.formatInterpolation(
        cls,
        baseIndent,
        maxClassesPerLine,
        formatClassesFn,
      );
    }

    const prefix = cls.substring(0, startIndex);
    const suffix = cls.substring(end);
    const innerExpr = cls.substring(startIndex + 2, end - 1);
    const ternary = this.parseTernaryArms(innerExpr);
    if (!ternary) {
      return super.formatInterpolation(
        cls,
        baseIndent,
        maxClassesPerLine,
        formatClassesFn,
      );
    }

    // Check if arms are template literals
    const consequentStr = ternary.consequent.trim();
    const alternateStr = ternary.alternate.trim();

    if (
      !consequentStr.startsWith('`') ||
      !consequentStr.endsWith('`') ||
      !alternateStr.startsWith('`') ||
      !alternateStr.endsWith('`')
    ) {
      return super.formatInterpolation(
        cls,
        baseIndent,
        maxClassesPerLine,
        formatClassesFn,
      );
    }

    const consequentContent = consequentStr.slice(1, -1);
    const alternateContent = alternateStr.slice(1, -1);
    const exprIndent = baseIndent + '  ';

    const formattedConsequent = formatClassesFn(
      consequentContent,
      exprIndent,
      maxClassesPerLine,
    );
    const formattedAlternate = formatClassesFn(
      alternateContent,
      exprIndent,
      maxClassesPerLine,
    );

    // Always return the reconstructed ternary to enforce consistent spacing

    return (
      prefix +
      '${' +
      ternary.condition +
      ' ? `' +
      formattedConsequent +
      '` : `' +
      formattedAlternate +
      '`}' +
      suffix
    );
  }
}

