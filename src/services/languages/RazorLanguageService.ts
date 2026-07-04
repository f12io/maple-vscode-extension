import { skipStringLiteral } from '../../helpers/extractor.helper';
import { StringLiteralMatch } from '../LanguageService';
import { InterpolationContext, InterpolationMatch } from './BaseLanguageService';
import { HtmlLanguageService } from './HtmlLanguageService';

const IMPLICIT_EXPR_START_REGEX = /^@[a-zA-Z_]\w*/;
const MEMBER_ACCESS_REGEX = /^\.\w+/;

export class RazorLanguageService extends HtmlLanguageService {
  languageIds = ['razor', 'aspnetcorerazor'];

  public getRenderedClassText(word: string): string {
    // Razor renders the @@ escape as a single literal @
    return word.replace(/@@/g, '@');
  }

  public getMultilineStringDelimiters(
    rawQuote: string,
    content: string,
  ): { open: string; close: string } | undefined {
    // Only verbatim C# strings can hold newlines. Upgrading is unsafe when
    // the content has backslash escapes (verbatim strings don't process them).
    if (content.includes('\\')) return undefined;
    if (rawQuote === '$"' || rawQuote === '$@"') {
      return { open: '$@"', close: '"' };
    }
    if (rawQuote === '"') {
      return { open: '@"', close: '"' };
    }
    return undefined;
  }

  public matchStringLiteral(
    text: string,
    index: number,
  ): StringLiteralMatch | undefined {
    if (text[index] === '$') {
      if (text[index + 1] === '"') {
        const end = this.skipCSharpInterpolatedString(text, index + 2, false);
        if (end < index + 3 || text[end - 1] !== '"') return undefined;
        return {
          start: index,
          contentStart: index + 2,
          contentEnd: end - 1,
          endIndex: end,
          rawDelimiter: '$"',
          isInterpolated: true,
        };
      }
      if (text[index + 1] === '@' && text[index + 2] === '"') {
        const end = this.skipCSharpInterpolatedString(text, index + 3, true);
        if (end < index + 4 || text[end - 1] !== '"') return undefined;
        return {
          start: index,
          contentStart: index + 3,
          contentEnd: end - 1,
          endIndex: end,
          rawDelimiter: '$@"',
          isInterpolated: true,
        };
      }
    }
    return super.matchStringLiteral(text, index);
  }

  protected skipStringAt(expr: string, index: number): number {
    const ch = expr[index];

    // C# interpolated string: $"..." or $@"..."
    if (ch === '$') {
      if (expr[index + 1] === '"') {
        return this.skipCSharpInterpolatedString(expr, index + 2, false);
      }
      if (expr[index + 1] === '@' && expr[index + 2] === '"') {
        return this.skipCSharpInterpolatedString(expr, index + 3, true);
      }
    }

    return super.skipStringAt(expr, index);
  }

  /**
   * Scans a C# interpolated string starting just after its opening quote and
   * returns the index after the closing quote. Handles `{expr}` holes with
   * nested strings, `{{`/`}}` brace escapes, backslash escapes (non-verbatim)
   * and `""` quote escapes (verbatim).
   */
  private skipCSharpInterpolatedString(
    expr: string,
    contentStart: number,
    isVerbatim: boolean,
  ): number {
    let j = contentStart;
    let braceDepth = 0;

    while (j < expr.length) {
      const c = expr[j];

      if (braceDepth === 0) {
        if (c === '{' && expr[j + 1] === '{') {
          j += 2; // escaped literal brace
          continue;
        }
        if (c === '}' && expr[j + 1] === '}') {
          j += 2; // escaped literal brace
          continue;
        }
        if (c === '{') {
          braceDepth++;
          j++;
          continue;
        }
        if (!isVerbatim && c === '\\') {
          j += 2; // backslash escape (\", \\, \n, ...)
          continue;
        }
        if (isVerbatim && c === '"' && expr[j + 1] === '"') {
          j += 2; // verbatim quote escape
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
        } else if (c === '"' || c === "'") {
          // Nested string inside an interpolation hole
          j = skipStringLiteral(expr, j);
          continue;
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

    const formatted = super.formatInterpolation(
      cls,
      baseIndent,
      maxClassesPerLine,
      formatClassesFn,
    );

    if (formatted === cls) return formatted;

    return this.upgradeMultilineInterpolatedStrings(formatted);
  }

  /**
   * Upgrades C# interpolated strings ($"...") to verbatim interpolated
   * strings ($@"...") only when formatting actually injected newlines into
   * them, because standard interpolated strings cannot contain unescaped
   * newlines. Strings the formatter left single-line keep their original
   * form (and their escape semantics).
   */
  private upgradeMultilineInterpolatedStrings(formatted: string): string {
    let result = '';
    let i = 0;
    while (i < formatted.length) {
      if (formatted[i] === '$' && formatted[i + 1] === '"') {
        const end = this.skipCSharpInterpolatedString(formatted, i + 2, false);
        const segment = formatted.substring(i, end);
        result += segment.includes('\n') ? '$@' + segment.substring(1) : segment;
        i = end;
        continue;
      }
      result += formatted[i];
      i++;
    }
    return result;
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
    const startIndex = cls.indexOf('@(');
    if (startIndex === -1) return undefined;
    const end = this.parseBalanced(cls, startIndex + 1);
    if (end === -1) return undefined;

    const prefix = cls.substring(0, startIndex);
    const suffix = cls.substring(end);
    const innerExpr = cls.substring(startIndex + 2, end - 1);

    const formattedExpr = this.formatExpression(
      innerExpr,
      baseIndent,
      maxClassesPerLine,
      formatClassesFn,
    );
    if (formattedExpr === undefined) return undefined;

    return prefix + '@(' + formattedExpr + ')' + suffix;
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

    const consequentStr = ternary.consequent.trim();
    const alternateStr = ternary.alternate.trim();

    // Reconstructing the ternary rewrites both arms as verbatim strings
    // ($@"..."), which changes what backslash escapes mean. Bail out when a
    // non-verbatim arm contains escapes so we never alter runtime values.
    if (
      (consequentStr.startsWith('$"') && consequentStr.includes('\\')) ||
      (alternateStr.startsWith('$"') && alternateStr.includes('\\'))
    ) {
      return undefined;
    }

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

    // Always return the reconstructed ternary to enforce consistent spacing (e.g., spaces around `?` and `:`)

    // Determine string prefix: use $@" for interpolated strings
    const consequentIsInterpolated =
      consequentStr.startsWith('$"') || consequentStr.startsWith('$@"');
    const alternateIsInterpolated =
      alternateStr.startsWith('$"') || alternateStr.startsWith('$@"');

    const consequentPrefix = consequentIsInterpolated ? '$@' : '';
    const alternatePrefix = alternateIsInterpolated ? '$@' : '';

    return (
      ternary.condition +
      ' ? ' +
      consequentPrefix +
      '"' +
      formattedConsequent +
      '" : ' +
      alternatePrefix +
      '"' +
      formattedAlternate +
      '"'
    );
  }

  protected parseInterpolation(
    value: string,
    index: number,
    context?: InterpolationContext,
  ): InterpolationMatch | undefined {
    // Escaped transition: @@ renders a single literal '@' — never the start
    // of an expression.
    if (value[index] === '@' && value[index + 1] === '@') {
      return {
        innerExprStart: index,
        innerExprEnd: index + 2,
        endIndex: index + 2,
        isLiteral: true,
      };
    }

    // Razor interpolation: @(...)
    if (value.substring(index, index + 2) === '@(') {
      const end = this.parseBalanced(value, index + 1);
      if (end !== -1) {
        return {
          innerExprStart: index + 2,
          innerExprEnd: end - 1,
          endIndex: end,
        };
      }
    }

    // Razor implicit expression: @identifier followed by any chain of
    // member accesses, method calls, or indexers (@Model.Css, @Get(x)[0])
    if (
      value[index] === '@' &&
      value[index + 1] !== '@' &&
      value[index + 1] !== '('
    ) {
      const match = IMPLICIT_EXPR_START_REGEX.exec(value.substring(index));
      if (match) {
        let end = index + match[0].length;
        for (;;) {
          if (value[end] === '.' && MEMBER_ACCESS_REGEX.test(value.substring(end))) {
            const memberMatch = MEMBER_ACCESS_REGEX.exec(value.substring(end));
            end += memberMatch![0].length;
            continue;
          }
          if (value[end] === '(' || value[end] === '[') {
            const balancedEnd = this.parseBalanced(value, end);
            if (balancedEnd === -1) break;
            end = balancedEnd;
            continue;
          }
          break;
        }
        return {
          innerExprStart: index + 1,
          innerExprEnd: end,
          endIndex: end,
        };
      }
    }

    // Inside a non-verbatim C# interpolated string, backslash escapes are
    // processed at runtime: \t, \n etc. render as whitespace (separating
    // classes), while \\ and \" render as literal characters. Verbatim
    // strings ($@") treat backslashes literally, so only $" applies.
    if (context?.stringDelimiter === '$"' && value[index] === '\\') {
      const next = value[index + 1] ?? '';
      if (/[tnrfv0]/.test(next)) {
        // Whitespace escape — acts as a class separator, contains no expression
        return {
          innerExprStart: index,
          innerExprEnd: index,
          endIndex: index + 2,
        };
      }
      // Any other escape stays attached to the surrounding token verbatim
      return {
        innerExprStart: index,
        innerExprEnd: index + 2,
        endIndex: index + 2,
        isLiteral: true,
      };
    }

    // Braces are expression holes inside C# interpolated strings
    // ($"w-{width}"); in plain Razor markup they are literal text. When no
    // context is available (tokenization of already-extracted values) treat
    // them as holes so brace expressions stay grouped in one token.
    const inInterpolatedString =
      context?.stringDelimiter === '$"' || context?.stringDelimiter === '$@"';
    if (!context || inInterpolatedString) {
      if (value[index] === '{' && value[index + 1] === '{') {
        return {
          innerExprStart: index,
          innerExprEnd: index + 2,
          endIndex: index + 2,
          isLiteral: true,
        };
      }
      if (value[index] === '}' && value[index + 1] === '}') {
        return {
          innerExprStart: index,
          innerExprEnd: index + 2,
          endIndex: index + 2,
          isLiteral: true,
        };
      }
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
    }

    return super.parseInterpolation(value, index, context);
  }
}
