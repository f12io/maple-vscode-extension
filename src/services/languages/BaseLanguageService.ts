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
} from '../../helpers/extractor.helper';
import { ClassInstance, ILanguageService, Token } from '../LanguageService';

export interface InterpolationMatch {
  innerExprStart: number;
  innerExprEnd: number;
  endIndex: number;
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

    // Deduplicate instances by start offset
    const uniqueInstances: Array<ClassInstance> = [];
    const seenStarts = new Set<number>();

    for (const instance of instances) {
      if (!seenStarts.has(instance.start)) {
        seenStarts.add(instance.start);
        uniqueInstances.push(instance);
      }
    }

    return uniqueInstances;
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
  ) {
    let currentStr = '';
    let currentStart = offset;
    let j = 0;

    while (j < value.length) {
      const interp = this.parseInterpolation(value, j);
      if (interp) {
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
          innerExpr,
          offset + interp.innerExprStart,
          text,
          matchIndex,
          instances,
          disabledBlocks,
          (val, off, txt, idx) =>
            this.extractAttributeClasses(
              val,
              off,
              txt,
              idx,
              instances,
              disabledBlocks,
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
  ): InterpolationMatch | undefined {
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
        tokenHasInterpolation = true;
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
    extractOptInStrings(text, instances, disabledBlocks, (val, off, txt, idx) =>
      this.extractAttributeClasses(
        val,
        off,
        txt,
        idx,
        instances,
        disabledBlocks,
      ),
    );
    extractStringsFromBraces(
      text,
      OPT_IN_OBJECT_START_REGEX,
      '{',
      '}',
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

  protected abstract extractFrameworkSpecificClasses(
    text: string,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }>,
  ): void;

  public isInsideClassAttribute(documentText: string, offset: number): boolean {
    // Look backward up to 2000 characters to find the last attribute start
    const prefix = documentText.substring(Math.max(0, offset - 2000), offset);

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
}
