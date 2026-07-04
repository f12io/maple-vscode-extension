import {
  IS_INSIDE_CLASS_ATTR_REGEX,
  OPT_IN_OBJECT_START_REGEX,
  STANDARD_ATTR_REGEX,
  IS_INSIDE_NO_QUOTE_CLASS_REGEX,
  MAPLE_INTERPOLATION_REGEX,
} from '../../constants/regex';
import {
  extractOptInStrings,
  extractStringLiterals,
  extractStringsFromBraces,
  findClosingQuote,
  getDisabledBlocks,
  pushInstance,
  shouldSkipMatch,
  skipStringLiteral,
} from '../../helpers/extractor.helper';
import {
  ClassInstance,
  dedupeInstancesByStart,
  ILanguageService,
  StringLiteralMatch,
  Token,
} from '../LanguageService';

/**
 * How far back from the cursor to search for the enclosing class attribute.
 * Bounds the per-keystroke completion cost in huge documents; attributes
 * longer than this won't be detected.
 */
const ATTRIBUTE_LOOKBEHIND_CHARS = 2000;

export interface InterpolationMatch {
  innerExprStart: number;
  innerExprEnd: number;
  endIndex: number;
  /**
   * The matched range is literal text (e.g. Razor's `@@` or C#'s `{{` escape):
   * consume it verbatim without splitting the instance or extracting an
   * expression from it.
   */
  isLiteral?: boolean;
}

export interface InterpolationContext {
  /**
   * Opening delimiter of the enclosing interpolated string (e.g. `$"`, `$@"`
   * or `` ` ``) while extracting its contents; undefined at the top level of
   * markup attributes. Services interpret the delimiters they own (e.g. Razor
   * treats braces as expression holes inside `$"`/`$@"` strings).
   */
  stringDelimiter?: string;
}

export abstract class BaseLanguageService implements ILanguageService {
  abstract languageIds: Array<string>;

  public extractClasses(text: string): Array<ClassInstance> {
    if (text.includes('maple-disable-file')) {
      return [];
    }

    const disabledBlocks = getDisabledBlocks(text);
    const instances: Array<ClassInstance> = [];

    this.extractStandardAttributes(text, instances, disabledBlocks);
    this.extractFrameworkSpecificClasses(text, instances, disabledBlocks);
    this.extractOptInComments(text, instances, disabledBlocks);

    return dedupeInstancesByStart(instances);
  }

  protected extractStandardAttributes(
    text: string,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }>,
  ) {
    for (const match of text.matchAll(STANDARD_ATTR_REGEX)) {
      if (shouldSkipMatch(text, match.index, disabledBlocks)) continue;
      const fullMatch = match[0];
      const quote = match[1];
      const attrStart = match.index + fullMatch.indexOf(quote) + 1;
      const closingQuoteIndex = findClosingQuote(text, attrStart, quote);

      if (closingQuoteIndex !== -1) {
        if (shouldSkipMatch(text, match.index, disabledBlocks)) continue;

        const innerString = text.substring(attrStart, closingQuoteIndex);
        const contentStart = attrStart;
        const contentEnd = contentStart + innerString.length;
        const value = text.substring(contentStart, contentEnd);

        this.extractAttributeClasses(
          value,
          contentStart,
          text,
          match.index,
          instances,
          disabledBlocks,
        );
      }
    }
  }

  protected extractAttributeClasses(
    value: string,
    offset: number,
    text: string,
    matchIndex: number,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }> = [],
    stringDelimiter?: string,
  ) {
    const context: InterpolationContext = { stringDelimiter };
    let currentStr = '';
    let currentStart = offset;
    let j = 0;

    while (j < value.length) {
      const interp = this.parseInterpolation(value, j, context);
      if (interp) {
        if (interp.isLiteral) {
          currentStr += value.substring(j, interp.endIndex);
          j = interp.endIndex;
          continue;
        }

        pushInstance(
          instances,
          currentStr,
          currentStart,
          text,
          matchIndex,
          disabledBlocks,
        );
        currentStr = '';

        const innerExpr = value.substring(
          interp.innerExprStart,
          interp.innerExprEnd,
        );
        extractStringLiterals(
          this,
          innerExpr,
          offset + interp.innerExprStart,
          text,
          matchIndex,
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

        j = interp.endIndex;
        currentStart = offset + j;
        continue;
      }

      if (value[j] === '{') {
        const mapleInterpolationMatch = value
          .substring(j)
          .match(MAPLE_INTERPOLATION_REGEX);
        if (mapleInterpolationMatch && !value.substring(0, j).endsWith(' ')) {
          currentStr += mapleInterpolationMatch[0];
          j += mapleInterpolationMatch[0].length;
        } else {
          currentStr += value[j];
          j++;
        }
      } else {
        currentStr += value[j];
        j++;
      }
    }

    pushInstance(
      instances,
      currentStr,
      currentStart,
      text,
      matchIndex,
      disabledBlocks,
    );
  }

  protected parseInterpolation(
    value: string,
    index: number,
    context?: InterpolationContext,
  ): InterpolationMatch | undefined {
    return undefined;
  }

  public getRenderedClassText(word: string): string {
    return word;
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
    return undefined;
  }

  public matchStringLiteral(
    text: string,
    index: number,
  ): StringLiteralMatch | undefined {
    const ch = text[index];
    if (ch === "'" || ch === '"') {
      const end = skipStringLiteral(text, index);
      if (end < index + 2 || text[end - 1] !== ch) return undefined;
      return {
        start: index,
        contentStart: index + 1,
        contentEnd: end - 1,
        endIndex: end,
        rawDelimiter: ch,
        isInterpolated: false,
      };
    }
    if (ch === '`') {
      const end = this.skipTemplateLiteral(text, index);
      if (end < index + 2 || text[end - 1] !== '`') return undefined;
      return {
        start: index,
        contentStart: index + 1,
        contentEnd: end - 1,
        endIndex: end,
        rawDelimiter: '`',
        isInterpolated: true,
      };
    }
    return undefined;
  }

  public getMultilineStringDelimiters(
    rawQuote: string,
    content: string,
  ): { open: string; close: string } | undefined {
    // Default policy is JavaScript-flavored (html/jsx/vue/svelte/twig opt-in
    // strings live in scripts): template literals hold newlines; '/" strings
    // are upgraded to template literals when that cannot change semantics.
    if (rawQuote === '`') {
      return { open: '`', close: '`' };
    }
    if (
      (rawQuote === "'" || rawQuote === '"') &&
      !content.includes('`') &&
      !content.includes('${') &&
      !content.includes('\\')
    ) {
      return { open: '`', close: '`' };
    }
    return undefined;
  }

  public tokenizeClassesWithIndices(str: string): Array<Token> {
    const tokens: Array<Token> = [];
    let currentToken = '';
    let tokenStart = -1;
    let tokenHasInterpolation = false;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      const interp = this.parseInterpolation(str, i);
      if (interp) {
        if (tokenStart === -1) tokenStart = i;
        currentToken += str.substring(i, interp.endIndex);
        i = interp.endIndex - 1;
        if (!interp.isLiteral) {
          tokenHasInterpolation = true;
        }
        continue;
      }

      if (char.trim() === '') {
        if (currentToken) {
          tokens.push({
            value: currentToken,
            start: tokenStart,
            end: i,
            hasInterpolation: tokenHasInterpolation,
          });
          currentToken = '';
          tokenStart = -1;
          tokenHasInterpolation = false;
        }
        continue;
      }

      if (tokenStart === -1) {
        tokenStart = i;
      }
      currentToken += char;
    }

    if (currentToken) {
      tokens.push({
        value: currentToken,
        start: tokenStart,
        end: str.length,
        hasInterpolation: tokenHasInterpolation,
      });
    }

    return tokens;
  }

  protected extractOptInComments(
    text: string,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }>,
  ) {
    extractOptInStrings(
      this,
      text,
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
    extractStringsFromBraces(
      this,
      text,
      OPT_IN_OBJECT_START_REGEX,
      '{',
      '}',
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

  protected abstract extractFrameworkSpecificClasses(
    text: string,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }>,
  ): void;

  public isInsideClassAttribute(documentText: string, offset: number): boolean {
    // Look backward a bounded distance to find the last attribute start
    const prefix = documentText.substring(
      Math.max(0, offset - ATTRIBUTE_LOOKBEHIND_CHARS),
      offset,
    );

    let lastMatch = null;
    for (const match of prefix.matchAll(IS_INSIDE_CLASS_ATTR_REGEX)) {
      lastMatch = match;
    }

    if (!lastMatch) {
      // Check for Angular/Svelte bindings without quotes
      const noQuoteRegex = IS_INSIDE_NO_QUOTE_CLASS_REGEX;
      if (noQuoteRegex.test(prefix)) {
        return true;
      }
      return false;
    }

    // The quote character used or backtick if React template literal
    const quote =
      lastMatch[1] || lastMatch[2] || lastMatch[3] || lastMatch[4] || '\`';

    // The string contents from the quote to the offset
    const insideString = prefix.substring(
      lastMatch.index + lastMatch[0].lastIndexOf(quote) + 1,
    );

    // If the insideString contains the matching quote (properly closed), it means the attribute was closed before the cursor
    if (findClosingQuote(insideString, 0, quote) !== -1) {
      return false;
    }

    return true;
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
    const replacements: Array<{
      start: number;
      end: number;
      replacement: string;
    }> = [];

    extractStringLiterals(
      this,
      cls,
      0,
      cls,
      0,
      [],
      [],
      (value, offset, _text, _matchIndex, literal) => {
        const innerIndent = baseIndent + '  ';
        const formatted = formatClassesFn(
          value,
          innerIndent,
          maxClassesPerLine,
        );

        if (formatted === value) return;

        // A multi-line result requires a string form that legally holds
        // newlines; when none exists (e.g. escape-bearing C# $" strings)
        // leave the string untouched rather than corrupt it.
        if (
          formatted.includes('\n') &&
          literal &&
          !this.getMultilineStringDelimiters(literal.rawDelimiter, value)
        ) {
          return;
        }

        replacements.push({
          start: offset,
          end: offset + value.length,
          replacement: formatted,
        });
      },
    );

    if (replacements.length === 0) return cls;

    // Apply bottom-up (right-to-left) to not mess up offsets
    replacements.sort((a, b) => b.start - a.start);

    let newCls = cls;
    for (const r of replacements) {
      const before = newCls.substring(0, r.start);
      const after = newCls.substring(r.end);
      newCls = before + r.replacement + after;
    }

    return newCls;
  }

  protected parseTernaryArms(
    expr: string,
  ):
    | { condition: string; consequent: string; alternate: string }
    | undefined {
    let i = 0;
    let questionIndex = -1;
    let ternaryDepth = 0;

    while (i < expr.length) {
      // Skip strings (language-specific via virtual method)
      const stringEnd = this.skipStringAt(expr, i);
      if (stringEnd > i) {
        i = stringEnd;
        continue;
      }

      const ch = expr[i];

      // Skip balanced parens, braces, brackets
      if (ch === '(' || ch === '[' || ch === '{') {
        i = this.skipBalanced(expr, i);
        continue;
      }

      // Match ternary ? (but not ?. or ??)
      if (ch === '?' && expr[i + 1] !== '.' && expr[i + 1] !== '?') {
        if (questionIndex === -1) {
          questionIndex = i;
        } else {
          ternaryDepth++;
        }
      } else if (ch === ':' && questionIndex !== -1) {
        if (ternaryDepth === 0) {
          return {
            condition: expr.substring(0, questionIndex).trim(),
            consequent: expr.substring(questionIndex + 1, i).trim(),
            alternate: expr.substring(i + 1).trim(),
          };
        } else {
          ternaryDepth--;
        }
      }

      i++;
    }

    return undefined;
  }

  /**
   * Scans a JS template literal starting at the backtick and returns the
   * index after the closing backtick, honoring `${...}` holes (which may
   * contain nested strings and template literals).
   */
  protected skipTemplateLiteral(expr: string, index: number): number {
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

  protected skipStringAt(expr: string, index: number): number {
    const ch = expr[index];
    if (ch === "'" || ch === '"') {
      return skipStringLiteral(expr, index);
    }
    return index;
  }

  /**
   * Scans a bracketed region starting at `openIndex` (which must hold the
   * opening char), skipping string literals via the language-specific
   * `skipStringAt`. Returns the index just after the matching close, or -1
   * when unbalanced.
   */
  protected parseBalanced(expr: string, openIndex: number): number {
    const open = expr[openIndex];
    const close = open === '(' ? ')' : open === '[' ? ']' : '}';
    let depth = 1;
    let j = openIndex + 1;
    while (j < expr.length) {
      const se = this.skipStringAt(expr, j);
      if (se > j) {
        j = se;
        continue;
      }
      if (expr[j] === open) depth++;
      else if (expr[j] === close) {
        depth--;
        if (depth === 0) return j + 1;
      }
      j++;
    }
    return -1;
  }

  private skipBalanced(expr: string, startIndex: number): number {
    const end = this.parseBalanced(expr, startIndex);
    return end === -1 ? expr.length : end;
  }
}
