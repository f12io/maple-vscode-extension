import { parseBalancedCharacters } from '../../helpers/extractor.helper';
import { ClassInstance } from '../LanguageService';
import { InterpolationMatch } from './BaseLanguageService';
import { HtmlLanguageService } from './HtmlLanguageService';

export class RazorLanguageService extends HtmlLanguageService {
  languageIds = ['razor', 'aspnetcorerazor'];

  protected extractFrameworkSpecificClasses(
    text: string,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }>,
  ): void {
    super.extractFrameworkSpecificClasses(text, instances, disabledBlocks);
    // Standard classes and Razor interpolations inside them are handled by superclass
  }

  protected skipStringAt(expr: string, index: number): number {
    const ch = expr[index];

    // C# interpolated string: $"..." or $@"..."
    if (ch === '$') {
      if (expr[index + 1] === '"') {
        return this.skipCSharpInterpolatedString(expr, index + 2);
      }
      if (expr[index + 1] === '@' && expr[index + 2] === '"') {
        return this.skipCSharpInterpolatedString(expr, index + 3);
      }
    }

    return super.skipStringAt(expr, index);
  }

  private skipCSharpInterpolatedString(
    expr: string,
    contentStart: number,
  ): number {
    let j = contentStart;
    let braceDepth = 0;

    while (j < expr.length) {
      const c = expr[j];

      if (braceDepth === 0) {
        if (c === '{') {
          braceDepth++;
          j++;
          continue;
        }
        if (c === '"') {
          return j + 1; // closing quote
        }
      } else {
        if (c === '{') {
          braceDepth++;
        } else if (c === '}') {
          braceDepth--;
        } else if (c === '"') {
          // Nested string inside interpolation — skip to closing "
          j++;
          while (j < expr.length && expr[j] !== '"') j++;
          // j at closing ", fall through to j++
        } else if (c === "'") {
          j++;
          while (j < expr.length && expr[j] !== "'") j++;
          // j at closing ', fall through to j++
        }
      }

      j++;
    }

    return expr.length;
  }

  private extractCSharpStringContent(str: string): string | undefined {
    if (str.startsWith('$@"') && str.endsWith('"')) {
      return str.slice(3, -1);
    }
    if (str.startsWith('$"') && str.endsWith('"')) {
      return str.slice(2, -1);
    }
    if (str.startsWith('"') && str.endsWith('"') && str.length >= 2) {
      return str.slice(1, -1);
    }
    return undefined;
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
    // Try ternary expansion for @(...) expressions
    const ternaryResult = this.formatTernaryInterpolation(
      cls,
      baseIndent,
      maxClassesPerLine,
      formatClassesFn,
    );
    if (ternaryResult !== undefined) {
      return ternaryResult;
    }

    // Fall back to existing behavior: format + upgrade $" to $@"
    const formatted = super.formatInterpolation(
      cls,
      baseIndent,
      maxClassesPerLine,
      formatClassesFn,
    );

    if (formatted === cls) return formatted;

    // Upgrade C# interpolated strings ($"...") to verbatim interpolated strings ($@"...")
    // because the formatter may have injected newlines into them, and standard C#
    // interpolated strings do not support unescaped newlines.
    let upgraded = formatted;
    let i = 0;
    while (i < upgraded.length) {
      if (upgraded[i] === '$' && upgraded[i + 1] === '"') {
        upgraded =
          upgraded.substring(0, i + 1) + '@' + upgraded.substring(i + 1);
        i += 2;
      } else {
        i++;
      }
    }
    return upgraded;
  }

  private formatTernaryInterpolation(
    cls: string,
    baseIndent: string,
    maxClassesPerLine: number,
    formatClassesFn: (
      value: string,
      indent: string,
      maxClasses: number,
    ) => string,
  ): string | undefined {
    // Only handle @(...) expressions
    if (!cls.startsWith('@(') || !cls.endsWith(')')) {
      return undefined;
    }

    const innerExpr = cls.slice(2, -1);
    const ternary = this.parseTernaryArms(innerExpr);
    if (!ternary) return undefined;

    const consequentStr = ternary.consequent.trim();
    const alternateStr = ternary.alternate.trim();

    const consequentContent = this.extractCSharpStringContent(consequentStr);
    const alternateContent = this.extractCSharpStringContent(alternateStr);

    if (consequentContent === undefined || alternateContent === undefined) {
      return undefined;
    }

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

    // Only expand if at least one arm was formatted to multi-line
    if (
      !formattedConsequent.includes('\n') &&
      !formattedAlternate.includes('\n')
    ) {
      return undefined;
    }

    // Determine string prefix: use $@" for interpolated strings
    const consequentIsInterpolated =
      consequentStr.startsWith('$"') || consequentStr.startsWith('$@"');
    const alternateIsInterpolated =
      alternateStr.startsWith('$"') || alternateStr.startsWith('$@"');

    const consequentPrefix = consequentIsInterpolated ? '$@' : '';
    const alternatePrefix = alternateIsInterpolated ? '$@' : '';

    return (
      '@(' +
      ternary.condition +
      ' ? ' +
      consequentPrefix +
      '"' +
      formattedConsequent +
      '" : ' +
      alternatePrefix +
      '"' +
      formattedAlternate +
      '")'
    );
  }

  protected parseInterpolation(
    value: string,
    index: number,
  ): InterpolationMatch | undefined {
    // Razor interpolation: @(...)
    if (value.substring(index, index + 2) === '@(') {
      const end = parseBalancedCharacters(value, index + 2, '(', ')');
      if (end !== -1) {
        return {
          innerExprStart: index + 2,
          innerExprEnd: end - 1,
          endIndex: end,
        };
      }
    }

    // Razor implicit expression: @variable
    if (
      value[index] === '@' &&
      value[index + 1] !== '@' &&
      value[index + 1] !== '('
    ) {
      const match = /^@[a-zA-Z_]\w*/.exec(value.substring(index));
      if (match) {
        return {
          innerExprStart: index + 1,
          innerExprEnd: index + match[0].length,
          endIndex: index + match[0].length,
        };
      }
    }

    // C# string interpolation: { ... }
    if (value[index] === '{') {
      const end = parseBalancedCharacters(value, index + 1, '{', '}');
      if (end !== -1) {
        return {
          innerExprStart: index + 1,
          innerExprEnd: end - 1,
          endIndex: end,
        };
      }
    }

    return super.parseInterpolation(value, index);
  }
}
