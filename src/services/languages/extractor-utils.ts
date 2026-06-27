import { ClassInstance } from '../LanguageService';

import {
  getDisableRegex,
  getEnableRegex,
  getObjectKeyRegex,
  MAPLE_CLASS_REGEX_NON_GLOBAL,
  START_COMMENT_STAR_REGEX,
  START_TAG_NAME_REGEX,
} from '../../constants/regex';

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
    const match = START_TAG_NAME_REGEX.exec(text.substring(lastOpen + 1));
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
  const disableRegex = getDisableRegex();
  const enableRegex = getEnableRegex();

  let disableMatch;
  while ((disableMatch = disableRegex.exec(text)) !== null) {
    const start = disableMatch.index;
    enableRegex.lastIndex = start;
    const enableMatch = enableRegex.exec(text);
    const end = enableMatch
      ? enableMatch.index + enableMatch[0].length
      : text.length;
    blocks.push({ start, end });
    disableRegex.lastIndex = end;
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
  const objectKeyRegex = getObjectKeyRegex();
  let keyMatch;
  while ((keyMatch = objectKeyRegex.exec(expr)) !== null) {
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
  const optInRegex = /\/\*\s*maple\s*\*\/\s*(["'`])/g;
  let match;
  while ((match = optInRegex.exec(text)) !== null) {
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
            if (char === '`' || char === '"' || char === "'") {
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
      optInRegex.lastIndex = matchEnd + 1;
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
    if (char === '"' || char === "'" || char === '`') {
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
              if (c === '"' || c === "'" || c === '`') {
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
  let match: RegExpExecArray | null;
  while ((match = startRegex.exec(text)) !== null) {
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
        if (char === '"' || char === "'" || char === '`') {
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

// Removed monolithic extraction and cursor detection logic
export function getExactWordRangeAtPosition(
  document: any, // using any here to avoid importing vscode in pure helper if needed, or we can use vscode types if we import it. Wait, class-extractor is currently independent of vscode?
  position: any,
): { wordRange: any | undefined; currentWord: string } {
  // We'll import vscode inside or just use duck typing since it's passed in.
  // Actually, we'll just implement it safely.
  const wordRange = document.getWordRangeAtPosition(
    position,
    MAPLE_CLASS_REGEX_NON_GLOBAL,
  );
  const currentWord = wordRange ? document.getText(wordRange) : '';

  if (!wordRange) {
    return { wordRange: undefined, currentWord: '' };
  }

  const cursorOffsetInWord = position.character - wordRange.start.character;
  const tokens = currentWord.split(/(["'\s])/);
  let currentOffset = 0;

  let finalRange = wordRange;
  let finalWord = '';

  for (const token of tokens) {
    const start = currentOffset;
    const end = currentOffset + token.length;

    if (cursorOffsetInWord > start && cursorOffsetInWord <= end) {
      if (token !== '"' && token !== "'" && token.trim() !== '') {
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
      if (token !== '"' && token !== "'" && token.trim() !== '') {
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
