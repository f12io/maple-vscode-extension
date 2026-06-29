import { ClassInstance } from '../services/LanguageService';

import {
  DISABLE_REGEX,
  ENABLE_REGEX,
  MAPLE_CLASS_REGEX_NON_GLOBAL,
  OBJECT_KEY_REGEX,
  OPT_IN_STRING_REGEX,
  START_COMMENT_STAR_REGEX,
  START_TAG_NAME_REGEX,
  TOKEN_SPLIT_REGEX,
} from '../constants/regex';

export function isQuote(char: string): boolean {
  return char === '"' || char === "'" || char === '`';
}

export function findClosingQuote(
  text: string,
  startIndex: number,
  quote: string,
): number {
  let parenDepth = 0;
  let braceDepth = 0;
  let i = startIndex;

  while (i < text.length) {
    const char = text[i];
    const prevChar = i > 0 ? text[i - 1] : '';

    if (prevChar === '\\') {
      i++;
      continue;
    }

    if (char === '(' && prevChar === '@') {
      parenDepth++;
    } else if (char === '(' && parenDepth > 0) {
      parenDepth++;
    } else if (char === ')') {
      if (parenDepth > 0) parenDepth--;
    } else if (char === '{') {
      braceDepth++;
    } else if (char === '}') {
      if (braceDepth > 0) braceDepth--;
    } else if (char === quote) {
      if (parenDepth === 0 && braceDepth === 0) {
        return i;
      }
    }

    if (i - startIndex > 5000) {
      return -1; // safety timeout
    }

    i++;
  }
  return -1;
}

export function getTagNameBackwards(
  text: string,
  index: number,
): string | undefined {
  const prefix = text.substring(0, index);
  const lastOpen = prefix.lastIndexOf('<');
  const lastClose = prefix.lastIndexOf('>');
  if (lastOpen !== -1 && lastOpen > lastClose) {
    const match = text.substring(lastOpen + 1).match(START_TAG_NAME_REGEX);
    if (match) {
      return match[1].toLowerCase();
    }
  }
  return undefined;
}

export function isCommentedOut(text: string, index: number): boolean {
  const lastNewline = text.lastIndexOf('\n', index);
  const lineToMatch = text.substring(lastNewline + 1, index);
  if (lineToMatch.includes('//')) return true;
  if (lineToMatch.includes('<!--')) return true;
  if (START_COMMENT_STAR_REGEX.test(lineToMatch)) return true;

  const lastSlashStar = lineToMatch.lastIndexOf('/*');
  if (lastSlashStar !== -1) {
    const lastStarSlash = lineToMatch.lastIndexOf('*/');
    if (lastStarSlash < lastSlashStar) {
      return true;
    }
  }

  return false;
}

export function isLineDisabled(text: string, index: number): boolean {
  const lastNewline = text.lastIndexOf('\n', index);
  let nextNewline = text.indexOf('\n', index);
  if (nextNewline === -1) nextNewline = text.length;

  const fullLine = text.substring(lastNewline + 1, nextNewline);

  if (fullLine.includes('maple-disable-line')) return true;

  if (lastNewline !== -1) {
    const prevNewline = text.lastIndexOf('\n', lastNewline - 1);
    const prevLine = text.substring(prevNewline + 1, lastNewline);
    if (prevLine.includes('maple-disable-next-line')) return true;
  }

  return false;
}

export function getDisabledBlocks(
  text: string,
): Array<{ start: number; end: number }> {
  const blocks: Array<{ start: number; end: number }> = [];
  const disableMatches = [...text.matchAll(DISABLE_REGEX)];
  const enableMatches = [...text.matchAll(ENABLE_REGEX)];

  let currentEnd = 0;
  for (const disableMatch of disableMatches) {
    const start = disableMatch.index;
    if (start < currentEnd) continue;

    const enableMatch = enableMatches.find((m) => m.index > start);
    const end = enableMatch
      ? enableMatch.index + enableMatch[0].length
      : text.length;
    blocks.push({ start, end });
    currentEnd = end;
  }

  return blocks;
}

export function shouldSkipMatch(
  text: string,
  index: number,
  disabledBlocks: Array<{ start: number; end: number }> = [],
): boolean {
  if (isCommentedOut(text, index) || isLineDisabled(text, index)) return true;

  for (const block of disabledBlocks) {
    if (index >= block.start && index <= block.end) return true;
  }

  return false;
}

export function pushInstance(
  instances: Array<ClassInstance>,
  value: string,
  start: number,
  text: string,
  matchIndex: number,
  disabledBlocks: Array<{ start: number; end: number }> = [],
) {
  if (shouldSkipMatch(text, start, disabledBlocks)) return;

  instances.push({
    value,
    start,
    end: start + value.length,
    tagName: getTagNameBackwards(text, matchIndex),
  });
}

export function extractUnquotedObjectKeys(
  expr: string,
  exprStart: number,
  text: string,
  matchIndex: number,
  instances: Array<ClassInstance>,
  disabledBlocks: Array<{ start: number; end: number }> = [],
) {
  for (const keyMatch of expr.matchAll(OBJECT_KEY_REGEX)) {
    const value = keyMatch[1];
    const keyIdx = keyMatch[0].indexOf(value);
    const start = exprStart + keyMatch.index + keyIdx;
    pushInstance(instances, value, start, text, matchIndex, disabledBlocks);
  }
}

export function extractOptInStrings(
  text: string,
  instances: Array<ClassInstance>,
  disabledBlocks: Array<{ start: number; end: number }> = [],
  extractCallback?: (
    value: string,
    offset: number,
    text: string,
    matchIndex: number,
  ) => void,
) {
  let currentEnd = 0;
  for (const match of text.matchAll(OPT_IN_STRING_REGEX)) {
    if (match.index < currentEnd) continue;
    if (shouldSkipMatch(text, match.index, disabledBlocks)) continue;

    const quoteChar = match[1];
    let j = match.index + match[0].length;
    let braceDepth = 0;
    let inString = false;
    let innerQuoteChar = null;
    let isEscaped = false;

    const contentStart = j;
    let matchEnd = -1;

    while (j < text.length) {
      const char = text[j];

      if (isEscaped) {
        isEscaped = false;
        j++;
        continue;
      }

      if (char === '\\') {
        isEscaped = true;
        j++;
        continue;
      }

      if (quoteChar === '`') {
        if (braceDepth === 0) {
          if (char === '$' && text[j + 1] === '{') {
            braceDepth++;
            j += 2;
            continue;
          } else if (char === '`') {
            matchEnd = j;
            break;
          }
        } else {
          if (inString) {
            if (char === innerQuoteChar) {
              inString = false;
            }
          } else {
            if (isQuote(char)) {
              inString = true;
              innerQuoteChar = char;
            } else if (char === '{') {
              braceDepth++;
            } else if (char === '}') {
              braceDepth--;
            }
          }
        }
      } else {
        if (char === quoteChar) {
          matchEnd = j;
          break;
        }
      }
      j++;
    }

    if (matchEnd !== -1) {
      const value = text.substring(contentStart, matchEnd);
      if (quoteChar === '`') {
        if (extractCallback) {
          extractCallback(value, contentStart, text, match.index);
        }
      } else {
        pushInstance(
          instances,
          value,
          contentStart,
          text,
          match.index,
          disabledBlocks,
        );
      }
      currentEnd = matchEnd + 1;
    }
  }
}

export function parseBalancedCharacters(
  value: string,
  startIndex: number,
  openChar: string,
  closeChar: string,
): number {
  let count = 1;
  let i = startIndex;
  while (i < value.length && count > 0) {
    if (value[i] === openChar) count++;
    else if (value[i] === closeChar) count--;
    i++;
  }
  if (count === 0) return i;
  return -1;
}

export function extractStringLiterals(
  expr: string,
  exprStart: number,
  text: string,
  matchIndex: number,
  instances: Array<ClassInstance>,
  disabledBlocks: Array<{ start: number; end: number }> = [],
  extractCallback?: (
    value: string,
    offset: number,
    text: string,
    matchIndex: number,
    isCSharpInterpolated: boolean,
  ) => void,
) {
  let j = 0;

  while (j < expr.length) {
    const char = expr[j];
    if (isQuote(char)) {
      const quoteChar = char;
      const start = exprStart + j + 1;
      let isCSharpInterpolated = false;
      if (j > 0 && expr[j - 1] === '$') {
        isCSharpInterpolated = true;
      }
      let isEscaped = false;
      let braceDepth = 0;
      let matchEnd = -1;
      let inInnerString = false;
      let innerQuoteChar: string | null = null;
      j++;

      while (j < expr.length) {
        const c = expr[j];
        if (isEscaped) {
          isEscaped = false;
          j++;
          continue;
        }
        if (c === '\\') {
          isEscaped = true;
          j++;
          continue;
        }

        if (quoteChar === '`' || isCSharpInterpolated) {
          if (braceDepth === 0) {
            if (quoteChar === '`' && c === '$' && expr[j + 1] === '{') {
              braceDepth++;
              j += 2;
              continue;
            } else if (isCSharpInterpolated && c === '{') {
              braceDepth++;
              j++;
              continue;
            } else if (c === quoteChar) {
              matchEnd = j;
              break;
            }
          } else {
            if (inInnerString) {
              if (c === innerQuoteChar) {
                inInnerString = false;
              }
            } else {
              if (isQuote(c)) {
                inInnerString = true;
                innerQuoteChar = c;
              } else if (c === '{') {
                braceDepth++;
              } else if (c === '}') {
                braceDepth--;
              }
            }
          }
        } else {
          if (c === quoteChar) {
            matchEnd = j;
            break;
          }
        }
        j++;
      }

      if (matchEnd !== -1) {
        const valueStr = expr.substring(start - exprStart, matchEnd);
        if (quoteChar === '`' || isCSharpInterpolated) {
          if (extractCallback) {
            extractCallback(
              valueStr,
              start,
              text,
              matchIndex,
              isCSharpInterpolated,
            );
          }
        } else {
          pushInstance(
            instances,
            valueStr,
            start,
            text,
            matchIndex,
            disabledBlocks,
          );
        }
      }
    }
    j++;
  }
}

export function extractStringsFromBraces(
  text: string,
  startRegex: RegExp,
  openChar: string,
  closeChar: string,
  instances: Array<ClassInstance>,
  disabledBlocks: Array<{ start: number; end: number }> = [],
  extractCallback?: (
    value: string,
    offset: number,
    text: string,
    matchIndex: number,
    isCSharpInterpolated: boolean,
  ) => void,
) {
  for (const match of text.matchAll(startRegex)) {
    if (shouldSkipMatch(text, match.index, disabledBlocks)) continue;

    let braceCount = 1;
    let i = match.index + match[0].length;
    let inString = false;
    let quoteChar = null;
    let isEscaped = false;

    while (i < text.length && braceCount > 0) {
      const char = text[i];
      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (char === '\\') {
          isEscaped = true;
        } else if (char === quoteChar) {
          inString = false;
        }
      } else {
        if (isQuote(char)) {
          inString = true;
          quoteChar = char;
        } else if (char === openChar) {
          braceCount++;
        } else if (char === closeChar) {
          braceCount--;
        }
      }
      i++;
    }

    if (braceCount === 0) {
      const expr = text.substring(match.index + match[0].length, i - 1);
      const exprStart = match.index + match[0].length;

      extractStringLiterals(
        expr,
        exprStart,
        text,
        match.index,
        instances,
        disabledBlocks,
        extractCallback,
      );

      // Extract unquoted object keys (e.g., { fx: true } after Prettier removes quotes)
      extractUnquotedObjectKeys(
        expr,
        exprStart,
        text,
        match.index,
        instances,
        disabledBlocks,
      );
    }
  }
}

export function getExactWordRangeAtPosition(
  document: any,
  position: any,
): { wordRange: any | undefined; currentWord: string } {
  const wordRange = document.getWordRangeAtPosition(
    position,
    MAPLE_CLASS_REGEX_NON_GLOBAL,
  );
  const currentWord = wordRange ? document.getText(wordRange) : '';

  if (!wordRange) {
    return { wordRange: undefined, currentWord: '' };
  }

  const cursorOffsetInWord = position.character - wordRange.start.character;
  const tokens = currentWord.split(TOKEN_SPLIT_REGEX);
  let currentOffset = 0;

  let finalRange = wordRange;
  let finalWord = '';

  for (const token of tokens) {
    const start = currentOffset;
    const end = currentOffset + token.length;

    if (cursorOffsetInWord > start && cursorOffsetInWord <= end) {
      if (!isQuote(token) && token.trim() !== '') {
        finalWord = token;
        finalRange = wordRange.with(
          wordRange.start.translate(0, start),
          wordRange.start.translate(0, end),
        );
      } else {
        finalRange = undefined;
        finalWord = '';
      }
      break;
    } else if (cursorOffsetInWord === 0 && start === 0) {
      if (!isQuote(token) && token.trim() !== '') {
        finalWord = token;
        finalRange = wordRange.with(
          wordRange.start.translate(0, start),
          wordRange.start.translate(0, end),
        );
        break;
      }
    }
    currentOffset = end;
  }

  if (finalWord && finalRange) {
    // Strip trailing HTML characters if it still bled (e.g. `bgc-red>`)
    const cleanWord = finalWord.replace(/[><]+$/, '').replace(/<![\-]*$/, '');
    if (cleanWord !== finalWord) {
      const diff = finalWord.length - cleanWord.length;
      finalRange = finalRange.with(
        undefined,
        finalRange.end.translate(0, -diff),
      );
      finalWord = cleanWord;
    }
  }

  return { wordRange: finalRange, currentWord: finalWord };
}
