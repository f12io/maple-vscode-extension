import {
  MAPLE_INTERPOLATION_REGEX,
  OPT_IN_OBJECT_START_REGEX,
  STANDARD_ATTR_REGEX,
} from '../../constants/regex';
import {
  extractStringLiterals,
  extractUnquotedObjectKeys,
  findClosingQuote,
  findOptInRegions,
  getDisabledBlocks,
  MAX_SCAN_LENGTH,
  pushInstance,
  shouldSkipMatch,
  skipStringLiteral,
} from '../../helpers/extractor.helper';
import {
  ClassInstance,
  dedupeInstancesByStart,
  ILanguageService,
  MapleRegion,
  StringLiteralMatch,
  Token,
} from '../LanguageService';

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

    for (const region of this.collectRegions(text)) {
      if (shouldSkipMatch(text, region.anchor, disabledBlocks)) continue;

      if (region.kind === 'class-text') {
        this.extractAttributeClasses(
          text.substring(region.start, region.end),
          region.start,
          text,
          region.anchor,
          instances,
          disabledBlocks,
        );
      } else {
        this.extractExpressionRegion(text, region, instances, disabledBlocks);
      }
    }

    // Canonical document order, independent of region discovery order
    return dedupeInstancesByStart(instances).sort((a, b) => a.start - b.start);
  }

  /**
   * Reports every maple region this language knows about. Subclasses add
   * framework-specific regions on top of the base set (class attributes and
   * opt-in comments).
   */
  public collectRegions(text: string): Array<MapleRegion> {
    const regions: Array<MapleRegion> = [];

    // Standard class attributes: class="...", className='...'
    for (const match of text.matchAll(STANDARD_ATTR_REGEX)) {
      const quote = match[1];
      const attrStart = match.index + match[0].indexOf(quote) + 1;
      const closingQuoteIndex = findClosingQuote(text, attrStart, quote);
      if (closingQuoteIndex === -1) continue;

      regions.push({
        start: attrStart,
        end: closingQuoteIndex,
        kind: 'class-text',
        anchor: match.index,
      });
    }

    // Opt-in expressions: /* maple */ <expression>
    for (const optIn of findOptInRegions(this, text)) {
      regions.push({
        start: optIn.regionStart,
        end: optIn.regionEnd,
        kind: 'expression',
        anchor: optIn.matchIndex,
      });
    }

    // Opt-in objects: /* maple */ { 'c-red': cond, p2: true }
    for (const match of text.matchAll(OPT_IN_OBJECT_START_REGEX)) {
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

  /**
   * Extracts maple classes from an `expression` region: every string literal
   * is class text (interpolated ones recurse through the language-specific
   * extractor), plus unquoted object keys when the region asks for them.
   */
  protected extractExpressionRegion(
    text: string,
    region: MapleRegion,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }>,
  ) {
    const expr = text.substring(region.start, region.end);

    extractStringLiterals(
      this,
      expr,
      region.start,
      text,
      region.anchor,
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

    if (region.includeObjectKeys) {
      extractUnquotedObjectKeys(
        expr,
        region.start,
        text,
        region.anchor,
        instances,
        disabledBlocks,
      );
    }
  }

  /**
   * Scans a bracketed region starting at `openIndex`, skipping string
   * literals via `matchStringLiteral` (so template literals and interpolated
   * strings are opaque). Returns the index after the matching close, or -1.
   */
  protected parseBalancedExpression(text: string, openIndex: number): number {
    const open = text[openIndex];
    const close = open === '(' ? ')' : open === '[' ? ']' : '}';
    let depth = 1;
    let i = openIndex + 1;
    const limit = Math.min(text.length, openIndex + MAX_SCAN_LENGTH);
    while (i < limit) {
      const literal = this.matchStringLiteral(text, i);
      if (literal) {
        i = literal.endIndex;
        continue;
      }
      if (text[i] === open) depth++;
      else if (text[i] === close) {
        depth--;
        if (depth === 0) return i + 1;
      }
      i++;
    }
    return -1;
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
