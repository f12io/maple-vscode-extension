import { skipStringLiteral } from '../../helpers/extractor.helper';
import { ClassInstance } from '../LanguageService';
import { InterpolationContext, InterpolationMatch } from './BaseLanguageService';
import { HtmlLanguageService } from './HtmlLanguageService';

interface PhpConcatSegment {
  type: 'string' | 'expression';
  value: string;
  content: string;
  quoteChar?: string;
}

export class PhpLanguageService extends HtmlLanguageService {
  languageIds = ['php'];

  public getMultilineStringDelimiters(
    rawQuote: string,
    content: string,
  ): { open: string; close: string } | undefined {
    // PHP string literals may legally contain raw newlines
    if (rawQuote === "'" || rawQuote === '"') {
      return { open: rawQuote, close: rawQuote };
    }
    return super.getMultilineStringDelimiters(rawQuote, content);
  }

  /**
   * Finds the `?>` that closes a PHP block, skipping string literals so a
   * `?>` inside '...' or "..." does not terminate the block early. Returns
   * the index of the `?` or -1.
   */
  private findPhpCloseTag(value: string, from: number): number {
    let i = from;
    while (i < value.length) {
      const stringEnd = this.skipStringAt(value, i);
      if (stringEnd > i) {
        i = stringEnd;
        continue;
      }
      if (value[i] === '?' && value[i + 1] === '>') {
        return i;
      }
      i++;
    }
    return -1;
  }

  protected extractFrameworkSpecificClasses(
    text: string,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }>,
  ): void {
    super.extractFrameworkSpecificClasses(text, instances, disabledBlocks);
    // Standard classes and PHP interpolations inside them are handled by superclass
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
    const ternaryResult = this.formatTernaryInterpolation(
      cls,
      baseIndent,
      maxClassesPerLine,
      formatClassesFn,
    );
    if (ternaryResult !== undefined) {
      return ternaryResult;
    }

    return super.formatInterpolation(
      cls,
      baseIndent,
      maxClassesPerLine,
      formatClassesFn,
    );
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
    const startIndex = cls.indexOf('<?');
    if (startIndex === -1) {
      return undefined;
    }
    const end = this.findPhpCloseTag(cls, startIndex + 2);
    if (end === -1) {
      return undefined;
    }

    const prefix = cls.substring(0, startIndex);
    const suffix = cls.substring(end + 2);

    // Strip open tag: <?= or <?php or <?
    let openTag = '<?';
    let innerExpr = cls.substring(startIndex + 2, end);
    if (innerExpr.startsWith('=')) {
      openTag = '<?=';
      innerExpr = innerExpr.slice(1);
    } else if (innerExpr.startsWith('php')) {
      openTag = '<?php';
      innerExpr = innerExpr.slice(3);
    }
    innerExpr = innerExpr.trim();

    const formattedExpr = this.formatExpression(
      innerExpr,
      baseIndent,
      maxClassesPerLine,
      formatClassesFn,
    );
    if (formattedExpr === undefined) return undefined;

    return prefix + openTag + ' ' + formattedExpr + ' ?>' + suffix;
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

    const exprIndent = baseIndent + '  ';

    const formattedConsequent = this.formatPhpArm(
      ternary.consequent.trim(),
      exprIndent,
      maxClassesPerLine,
      formatClassesFn,
    );
    const formattedAlternate = this.formatPhpArm(
      ternary.alternate.trim(),
      exprIndent,
      maxClassesPerLine,
      formatClassesFn,
    );

    if (formattedConsequent === undefined || formattedAlternate === undefined) {
      return undefined;
    }

    // Always return the reconstructed ternary to enforce consistent spacing

    return (
      ternary.condition +
      ' ? ' +
      formattedConsequent +
      ' : ' +
      formattedAlternate
    );
  }

  private formatPhpArm(
    arm: string,
    exprIndent: string,
    maxClassesPerLine: number,
    formatClassesFn: (
      value: string,
      indent: string,
      maxClasses: number,
    ) => string,
  ): string | undefined {
    const segments = this.parsePhpConcatenation(arm);
    if (segments.length === 0) return undefined;

    // Build virtual template replacing expressions with placeholders
    let virtualTemplate = '';
    const expressions: Array<string> = [];

    for (const segment of segments) {
      if (segment.type === 'string') {
        virtualTemplate += segment.content;
      } else {
        const placeholder = `__PHPEXPR${expressions.length}__`;
        expressions.push(segment.value);
        virtualTemplate += placeholder;
      }
    }

    const formatted = formatClassesFn(
      virtualTemplate,
      exprIndent,
      maxClassesPerLine,
    );

    if (!formatted.includes('\n')) {
      return arm; // No expansion needed
    }

    // Reconstruct PHP concatenation from formatted template
    const quoteChar =
      segments.find((s) => s.type === 'string')?.quoteChar || "'";

    if (expressions.length === 0) {
      // Simple string, wrap in quotes
      return quoteChar + formatted + quoteChar;
    }

    return this.reconstructPhpConcatenation(formatted, expressions, quoteChar);
  }

  private reconstructPhpConcatenation(
    formatted: string,
    expressions: Array<string>,
    quoteChar: string,
  ): string {
    const parts: Array<string> = [];
    let remaining = formatted;

    for (let i = 0; i < expressions.length; i++) {
      const placeholder = `__PHPEXPR${i}__`;
      const idx = remaining.indexOf(placeholder);
      if (idx === -1) return ''; // error fallback

      const before = remaining.substring(0, idx);
      remaining = remaining.substring(idx + placeholder.length);

      // Wrap the string part in quotes (even if empty — will be filtered)
      parts.push(quoteChar + before + quoteChar);
      parts.push(expressions[i]);
    }

    if (remaining && remaining.trim().length > 0) {
      parts.push(quoteChar + remaining + quoteChar);
    }

    // Filter out completely empty strings "''" or '""'
    const filteredParts = parts.filter(
      (p) => p !== "''" && p !== '""' && p !== '',
    );

    return filteredParts.join(' . ');
  }

  private parsePhpConcatenation(arm: string): Array<PhpConcatSegment> {
    const segments: Array<PhpConcatSegment> = [];
    let i = 0;
    const str = arm.trim();

    while (i < str.length) {
      // Skip whitespace
      while (i < str.length && str[i].trim() === '') i++;
      if (i >= str.length) break;

      // Skip concatenation operator
      if (str[i] === '.') {
        i++;
        continue;
      }

      const ch = str[i];

      if (ch === "'" || ch === '"') {
        const quoteChar = ch;
        const start = i;
        i = skipStringLiteral(str, i);
        const value = str.substring(start, i);
        const content = str.substring(start + 1, i - 1);
        segments.push({ type: 'string', value, content, quoteChar });
      } else if (ch === '(') {
        // Parenthesized expression
        const start = i;
        let depth = 1;
        i++;
        while (i < str.length && depth > 0) {
          if (str[i] === "'" || str[i] === '"') {
            i = skipStringLiteral(str, i);
            continue;
          }
          if (str[i] === '(') depth++;
          else if (str[i] === ')') depth--;
          if (depth > 0) i++;
        }
        if (i < str.length) i++; // skip closing )
        const value = str.substring(start, i).trim();
        if (value.length > 0) {
          segments.push({ type: 'expression', value, content: value });
        }
      } else {
        // Variable or function call
        const start = i;
        while (i < str.length && str[i] !== '.' && str[i].trim() !== '') {
          if (str[i] === '(') {
            let depth = 1;
            i++;
            while (i < str.length && depth > 0) {
              if (str[i] === '(') depth++;
              else if (str[i] === ')') depth--;
              i++;
            }
          } else {
            i++;
          }
        }
        const value = str.substring(start, i).trim();
        if (value.length > 0) {
          segments.push({ type: 'expression', value, content: value });
        }
      }
    }

    return segments;
  }

  protected parseInterpolation(
    value: string,
    index: number,
    context?: InterpolationContext,
  ): InterpolationMatch | undefined {
    // PHP interpolation: <? ... ?>
    if (value.substring(index, index + 2) === '<?') {
      const phpEnd = this.findPhpCloseTag(value, index + 2);
      if (phpEnd !== -1) {
        return {
          innerExprStart: index + 2,
          innerExprEnd: phpEnd,
          endIndex: phpEnd + 2,
        };
      }
    }

    // Internal placeholder for PHP concatenation expressions
    if (value.substring(index, index + 9) === '__PHPEXPR') {
      const match = /^__PHPEXPR\d+__/.exec(value.substring(index));
      if (match) {
        return {
          innerExprStart: index,
          innerExprEnd: index + match[0].length,
          endIndex: index + match[0].length,
        };
      }
    }

    return super.parseInterpolation(value, index, context);
  }
}
