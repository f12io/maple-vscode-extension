import { UTILITY_FUNC_START_REGEX } from '../../constants/regex';
import { extractStringsFromBraces } from '../../helpers/extractor.helper';
import { ClassInstance } from '../LanguageService';
import {
  BaseLanguageService,
  InterpolationContext,
  InterpolationMatch,
} from './BaseLanguageService';

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
      this,
      text,
      UTILITY_FUNC_START_REGEX,
      '(',
      ')',
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

  protected parseInterpolation(
    value: string,
    index: number,
    context?: InterpolationContext,
  ): InterpolationMatch | undefined {
    // JavaScript template literals: ${...}
    if (value.substring(index, index + 2) === '${') {
      const end = this.parseBalanced(value, index + 1);
      if (end !== -1) {
        return {
          innerExprStart: index + 2,
          innerExprEnd: end - 1,
          endIndex: end,
        };
      }
    }
    return super.parseInterpolation(value, index, context);
  }

  protected skipStringAt(expr: string, index: number): number {
    if (expr[index] === '`') {
      return this.skipTemplateLiteral(expr, index);
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
    const end = this.parseBalanced(cls, startIndex + 1);
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

    const formattedExpr = this.formatExpression(
      innerExpr,
      baseIndent,
      maxClassesPerLine,
      formatClassesFn,
    );
    if (formattedExpr === undefined) {
      return super.formatInterpolation(
        cls,
        baseIndent,
        maxClassesPerLine,
        formatClassesFn,
      );
    }

    return prefix + '${' + formattedExpr + '}' + suffix;
  }

  public formatExpression(
    expr: string,
    baseIndent: string,
    maxClassesPerLine: number,
    formatClassesFn: (
      value: string,
      indent: string,
      maxClasses: number,
    ) => string,
  ): string | undefined {
    const ternary = this.parseTernaryArms(expr);
    if (!ternary) return undefined;

    // Only ternaries with template-literal arms can hold multi-line output
    const consequentStr = ternary.consequent.trim();
    const alternateStr = ternary.alternate.trim();

    if (
      !consequentStr.startsWith('`') ||
      !consequentStr.endsWith('`') ||
      !alternateStr.startsWith('`') ||
      !alternateStr.endsWith('`')
    ) {
      return undefined;
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
      ternary.condition +
      ' ? `' +
      formattedConsequent +
      '` : `' +
      formattedAlternate +
      '`'
    );
  }
}

