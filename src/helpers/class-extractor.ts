export interface ClassInstance {
  value: string;
  start: number; // Absolute offset in document
  end: number;
  tagName?: string;
}

import {
  getAngularVueExprRegex,
  getDisableRegex,
  getEnableRegex,
  getHostClassRegex,
  getHostRegex,
  getIsInsideClassAttrRegex,
  getJsxExprStartRegex,
  getObjectKeyRegex,
  getOptInObjectStartRegex,
  getSpecificClassRegex,
  getStandardAttrRegex,
  getUtilityFuncStartRegex,
  IS_INSIDE_NO_QUOTE_CLASS_REGEX,
  MAPLE_CLASS_REGEX_NON_GLOBAL,
  MAPLE_INTERPOLATION_REGEX,
  START_COMMENT_STAR_REGEX,
  START_TAG_NAME_REGEX,
} from '../constants/regex';

function findClosingQuote(
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

function getTagNameBackwards(text: string, index: number): string | undefined {
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
        extractFromAttributeValue(
          value,
          contentStart,
          text,
          match.index,
          instances,
          disabledBlocks,
        );
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

export function extractFromAttributeValue(
  value: string,
  offset: number,
  text: string,
  matchIndex: number,
  instances: Array<ClassInstance>,
  disabledBlocks: Array<{ start: number; end: number }> = [],
  isCSharpInterpolated = false,
) {
  let currentStr = '';
  let currentStart = offset;
  let j = 0;
  while (j < value.length) {
    if (value.substring(j, j + 2) === '${') {
      pushInstance(
        instances,
        currentStr,
        currentStart,
        text,
        matchIndex,
        disabledBlocks,
      );
      currentStr = '';
      j += 2;
      let innerBraceCount = 1;
      const innerExprStart = j;
      while (j < value.length && innerBraceCount > 0) {
        if (value[j] === '{') innerBraceCount++;
        else if (value[j] === '}') innerBraceCount--;
        j++;
      }
      const innerExpr = value.substring(innerExprStart, j - 1);

      extractStringLiterals(
        innerExpr,
        offset + innerExprStart,
        text,
        matchIndex,
        instances,
        disabledBlocks,
      );

      currentStart = offset + j;
    } else if (isCSharpInterpolated && value[j] === '{') {
      pushInstance(
        instances,
        currentStr,
        currentStart,
        text,
        matchIndex,
        disabledBlocks,
      );
      currentStr = '';
      j += 1;
      let innerBraceCount = 1;
      const innerExprStart = j;
      while (j < value.length && innerBraceCount > 0) {
        if (value[j] === '{') innerBraceCount++;
        else if (value[j] === '}') innerBraceCount--;
        j++;
      }
      const innerExpr = value.substring(innerExprStart, j - 1);

      extractStringLiterals(
        innerExpr,
        offset + innerExprStart,
        text,
        matchIndex,
        instances,
        disabledBlocks,
      );

      currentStart = offset + j;
    } else if (value.substring(j, j + 2) === '@(') {
      pushInstance(
        instances,
        currentStr,
        currentStart,
        text,
        matchIndex,
        disabledBlocks,
      );
      currentStr = '';
      j += 2;
      let innerParenCount = 1;
      const innerExprStart = j;
      while (j < value.length && innerParenCount > 0) {
        if (value[j] === '(') innerParenCount++;
        else if (value[j] === ')') innerParenCount--;
        j++;
      }
      const innerExpr = value.substring(innerExprStart, j - 1);

      extractStringLiterals(
        innerExpr,
        offset + innerExprStart,
        text,
        matchIndex,
        instances,
        disabledBlocks,
      );

      currentStart = offset + j;
    } else if (value.substring(j, j + 2) === '<?') {
      pushInstance(
        instances,
        currentStr,
        currentStart,
        text,
        matchIndex,
        disabledBlocks,
      );
      currentStr = '';

      const phpEnd = value.indexOf('?>', j + 2);
      if (phpEnd !== -1) {
        const innerExpr = value.substring(j + 2, phpEnd);
        extractStringLiterals(
          innerExpr,
          offset + j + 2,
          text,
          matchIndex,
          instances,
          disabledBlocks,
        );
        j = phpEnd + 2;
      } else {
        j = value.length;
      }
      currentStart = offset + j;
    } else if (value[j] === '{') {
      const mapleInterpolationMatch = MAPLE_INTERPOLATION_REGEX.exec(
        value.substring(j),
      );
      if (mapleInterpolationMatch && !value.substring(0, j).endsWith(' ')) {
        currentStr += mapleInterpolationMatch[0];
        j += mapleInterpolationMatch[0].length;
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
      j += 1;
      let innerBraceCount = 1;
      const innerExprStart = j;
      while (j < value.length && innerBraceCount > 0) {
        if (value[j] === '{') innerBraceCount++;
        else if (value[j] === '}') innerBraceCount--;
        j++;
      }
      const innerExpr = value.substring(innerExprStart, j - 1);

      extractStringLiterals(
        innerExpr,
        offset + innerExprStart,
        text,
        matchIndex,
        instances,
        disabledBlocks,
      );

      currentStart = offset + j;
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

export function extractStringLiterals(
  expr: string,
  exprStart: number,
  text: string,
  matchIndex: number,
  instances: Array<ClassInstance>,
  disabledBlocks: Array<{ start: number; end: number }> = [],
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
          extractFromAttributeValue(
            valueStr,
            start,
            text,
            matchIndex,
            instances,
            disabledBlocks,
            isCSharpInterpolated,
          );
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

export function extractAllClasses(text: string): Array<ClassInstance> {
  if (text.includes('maple-disable-file')) {
    return [];
  }

  const disabledBlocks = getDisabledBlocks(text);
  const instances: Array<ClassInstance> = [];

  // 1. Standard attributes: class="", className="", CssClass=""
  // Must be preceded by space or start of tag to avoid matching the "class" inside ":class" or "[class]"
  const attrRegex = getStandardAttrRegex();
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(text)) !== null) {
    if (shouldSkipMatch(text, match.index, disabledBlocks)) continue;

    const quote = match[1];
    const attrStart = match.index + match[0].length;
    const closingQuoteIndex = findClosingQuote(text, attrStart, quote);

    if (closingQuoteIndex !== -1) {
      const value = text.substring(attrStart, closingQuoteIndex);
      extractFromAttributeValue(
        value,
        attrStart,
        text,
        match.index,
        instances,
        disabledBlocks,
      );
    }
  }

  // 2. Angular / Vue expressions: [ngClass]="...", :class="...", [class]="..."
  // This matches the container of the expression
  // We use this for objects, arrays, and ternaries where classes are inside strings: :class="{ 'c-red': isActive }"
  const exprRegex = getAngularVueExprRegex();
  while ((match = exprRegex.exec(text)) !== null) {
    if (shouldSkipMatch(text, match.index, disabledBlocks)) continue;

    const quote = match[1];
    const exprStart = match.index + match[0].length;
    const closingQuoteIndex = findClosingQuote(text, exprStart, quote);

    if (closingQuoteIndex !== -1) {
      const expr = text.substring(exprStart, closingQuoteIndex);
      // Find all string literals inside the expression: '...', "...", `...`
      extractStringLiterals(
        expr,
        exprStart,
        text,
        match.index,
        instances,
        disabledBlocks,
      );
      // Extract unquoted object keys
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

  // 3. Angular Host Bindings: host: { 'class': '...', '[class.xxx]': 'true' }
  const hostRegex = getHostRegex();
  while ((match = hostRegex.exec(text)) !== null) {
    if (shouldSkipMatch(text, match.index, disabledBlocks)) continue;

    const hostObj = match[1];
    const hostStart = match.index + match[0].indexOf(hostObj);

    // Extract 'class': '...'
    const hostClassRegex = getHostClassRegex();
    let hcMatch;
    while ((hcMatch = hostClassRegex.exec(hostObj)) !== null) {
      const quoteIdx = hcMatch[0].indexOf(hcMatch[1]);
      const start = hostStart + hcMatch.index + quoteIdx + 1;
      pushInstance(
        instances,
        hcMatch[2],
        start,
        text,
        match.index,
        disabledBlocks,
      );
    }
  }

  // 4. Angular [class.xxx]="..." and Svelte class:xxx="..."
  // specificClassRegex captures the class portion after the dot or colon
  const specificClassRegex = getSpecificClassRegex();
  while ((match = specificClassRegex.exec(text)) !== null) {
    if (shouldSkipMatch(text, match.index, disabledBlocks)) continue;

    const start = match.index + match[0].indexOf(match[1]);
    pushInstance(instances, match[1], start, text, match.index, disabledBlocks);
  }

  // 5. React / Solid JSX expressions: className={...}, class={...}, classList={...}
  extractStringsFromBraces(
    text,
    getJsxExprStartRegex(),
    '{',
    '}',
    instances,
    disabledBlocks,
  );

  // 6. Utility functions: clsx(...), classNames(...), cva(...)
  extractStringsFromBraces(
    text,
    getUtilityFuncStartRegex(),
    '(',
    ')',
    instances,
    disabledBlocks,
  );

  // 7. Explicit opt-in comments for strings: /\*maple */ '...', /\*maple */ `...`
  extractOptInStrings(text, instances, disabledBlocks);

  // 8. Explicit opt-in comments for objects: /\*maple */ { ... }
  extractStringsFromBraces(
    text,
    getOptInObjectStartRegex(),
    '{',
    '}',
    instances,
    disabledBlocks,
  );

  // Deduplicate instances by start offset to prevent double highlights/diagnostics
  // from overlapping extractors (e.g., className={clsx(...)})
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

export function isInsideClassAttribute(
  documentText: string,
  offset: number,
): boolean {
  // Look backward up to 2000 characters to find the last attribute start
  const prefix = documentText.substring(Math.max(0, offset - 2000), offset);

  // Match:
  // 1: class="
  // 2: [ngClass]="
  // 3: :class="
  // 4: host: { 'class': '
  // 5: [class.xxx]="
  // 6: class:xxx="
  // 7: className={`
  // 8: [class]="
  const attrRegex = getIsInsideClassAttrRegex();

  let match;
  let lastMatch = null;
  while ((match = attrRegex.exec(prefix)) !== null) {
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
    lastMatch[1] || lastMatch[2] || lastMatch[3] || lastMatch[4] || '`';

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
