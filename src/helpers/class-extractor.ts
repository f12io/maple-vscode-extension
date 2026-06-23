export interface ClassInstance {
  value: string;
  start: number; // Absolute offset in document
  end: number;
  tagName?: string;
}

function getTagNameBackwards(text: string, index: number): string | undefined {
  const prefix = text.substring(0, index);
  const lastOpen = prefix.lastIndexOf('<');
  const lastClose = prefix.lastIndexOf('>');
  if (lastOpen !== -1 && lastOpen > lastClose) {
    const match = /^\s*([a-zA-Z0-9\-]+)/.exec(text.substring(lastOpen + 1));
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
  if (lineToMatch.includes('/*')) return true;
  if (lineToMatch.includes('<!--')) return true;
  if (/^\s*\*/.test(lineToMatch)) return true;
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

export function shouldSkipMatch(text: string, index: number): boolean {
  return isCommentedOut(text, index) || isLineDisabled(text, index);
}

export function pushInstance(
  instances: Array<ClassInstance>,
  value: string,
  start: number,
  text: string,
  matchIndex: number,
) {
  if (value.trim().length > 0) {
    instances.push({
      value,
      start,
      end: start + value.length,
      tagName: getTagNameBackwards(text, matchIndex),
    });
  }
}

export function extractUnquotedObjectKeys(
  expr: string,
  exprStart: number,
  text: string,
  matchIndex: number,
  instances: Array<ClassInstance>,
) {
  const objectKeyRegex = /(?:[{,])\s*([a-zA-Z0-9\-_]+)\s*:/g;
  let keyMatch;
  while ((keyMatch = objectKeyRegex.exec(expr)) !== null) {
    const value = keyMatch[1];
    const keyIdx = keyMatch[0].indexOf(value);
    const start = exprStart + keyMatch.index + keyIdx;
    pushInstance(instances, value, start, text, matchIndex);
  }
}

export function extractFromTemplateLiteral(
  value: string,
  offset: number,
  text: string,
  matchIndex: number,
  instances: Array<ClassInstance>,
) {
  let currentStr = '';
  let currentStart = offset;
  let j = 0;
  while (j < value.length) {
    if (value.substring(j, j + 2) === '${') {
      pushInstance(instances, currentStr, currentStart, text, matchIndex);
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
      );

      currentStart = offset + j;
    } else {
      currentStr += value[j];
      j++;
    }
  }
  pushInstance(instances, currentStr, currentStart, text, matchIndex);
}

export function extractStringLiterals(
  expr: string,
  exprStart: number,
  text: string,
  matchIndex: number,
  instances: Array<ClassInstance>,
) {
  const stringLiteralRegex = /(["'`])([\s\S]*?)\1/g;
  let strMatch;
  while ((strMatch = stringLiteralRegex.exec(expr)) !== null) {
    const quoteIdx = strMatch[0].indexOf(strMatch[1]);
    const start = exprStart + strMatch.index + quoteIdx + 1;
    const value = strMatch[2];
    if (strMatch[1] === '`') {
      extractFromTemplateLiteral(value, start, text, matchIndex, instances);
    } else {
      pushInstance(instances, value, start, text, matchIndex);
    }
  }
}

export function extractStringsFromBraces(
  text: string,
  startRegex: RegExp,
  openChar: string,
  closeChar: string,
  instances: Array<ClassInstance>,
) {
  let match: RegExpExecArray | null;
  while ((match = startRegex.exec(text)) !== null) {
    if (shouldSkipMatch(text, match.index)) continue;

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

      extractStringLiterals(expr, exprStart, text, match.index, instances);

      // Extract unquoted object keys (e.g., { fx: true } after Prettier removes quotes)
      extractUnquotedObjectKeys(expr, exprStart, text, match.index, instances);
    }
  }
}

export function extractAllClasses(text: string): Array<ClassInstance> {
  if (text.includes('maple-disable-file')) {
    return [];
  }

  const instances: Array<ClassInstance> = [];

  // 1. Standard attributes: class="", className="", CssClass=""
  // Must be preceded by space or start of tag to avoid matching the "class" inside ":class" or "[class]"
  const attrRegex =
    /(?:^|[\s<>])(?:class|className|CssClass)\s*=\s*(["'])([\s\S]*?)\1/gi;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(text)) !== null) {
    if (shouldSkipMatch(text, match.index)) continue;

    const value = match[2];
    const valueMatchStr = match[1] + value + match[1];
    const start = match.index + match[0].indexOf(valueMatchStr) + 1; // +1 to skip the quote/backtick
    instances.push({
      value: value,
      start: start,
      end: start + value.length,
      tagName: getTagNameBackwards(text, match.index),
    });
  }

  // 2. Angular / Vue expressions: [ngClass]="...", :class="...", [class]="..."
  // This matches the container of the expression
  // We use this for objects, arrays, and ternaries where classes are inside strings: :class="{ 'c-red': isActive }"
  const exprRegex =
    /(?:\[ngClass\]|:class|\[class\])\s*=\s*(["'])([\s\S]*?)\1/gi;
  while ((match = exprRegex.exec(text)) !== null) {
    if (shouldSkipMatch(text, match.index)) continue;

    const expr = match[2];
    const exprStart = match.index + match[0].indexOf(expr);

    // Find all string literals inside the expression: '...', "...", `...`
    extractStringLiterals(expr, exprStart, text, match.index, instances);

    // Extract unquoted object keys
    extractUnquotedObjectKeys(expr, exprStart, text, match.index, instances);
  }

  // 3. Angular Host Bindings: host: { 'class': '...', '[class.xxx]': 'true' }
  const hostRegex = /host\s*:\s*\{([^}]+)\}/g;
  while ((match = hostRegex.exec(text)) !== null) {
    if (shouldSkipMatch(text, match.index)) continue;

    const hostObj = match[1];
    const hostStart = match.index + match[0].indexOf(hostObj);

    // Extract 'class': '...'
    const hostClassRegex =
      /(?:'class'|"class"|class)\s*:\s*(["'`])([\s\S]*?)\1/g;
    let hcMatch;
    while ((hcMatch = hostClassRegex.exec(hostObj)) !== null) {
      const quoteIdx = hcMatch[0].indexOf(hcMatch[1]);
      const start = hostStart + hcMatch.index + quoteIdx + 1;
      instances.push({
        value: hcMatch[2],
        start: start,
        end: start + hcMatch[2].length,
        tagName: getTagNameBackwards(text, match.index),
      });
    }
  }

  // 4. Angular [class.xxx]="..." and Svelte class:xxx="..."
  // specificClassRegex captures the class portion after the dot or colon
  const specificClassRegex =
    /(?:\[class\.|class:)([a-zA-Z0-9\-\@\:]+)(?:\]|\=|\s)/g;
  while ((match = specificClassRegex.exec(text)) !== null) {
    if (shouldSkipMatch(text, match.index)) continue;

    instances.push({
      value: match[1],
      start: match.index + match[0].indexOf(match[1]),
      end: match.index + match[0].indexOf(match[1]) + match[1].length,
      tagName: getTagNameBackwards(text, match.index),
    });
  }

  // 5. React / Solid JSX expressions: className={...}, class={...}, classList={...}
  extractStringsFromBraces(
    text,
    /(?:class|className|classList)\s*=\s*\{/gi,
    '{',
    '}',
    instances,
  );

  // 6. Utility functions: clsx(...), classNames(...), cva(...)
  extractStringsFromBraces(
    text,
    /(?:clsx|classNames|cva)\s*\(/gi,
    '(',
    ')',
    instances,
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
  const attrRegex =
    /(?:class|className|CssClass|\[ngClass\]|:class|\[class\])\s*=\s*(["'])|host\s*:\s*\{[^}]*(?:'class'|"class"|class)\s*:\s*(["'`])|\[class\.[^\]=]*\]\s*=\s*(["'])|class:[a-zA-Z0-9\-\@\:]+\s*=\s*(["'])|className\s*=\s*\{\s*`([^`]*)`/gi;

  let match;
  let lastMatch = null;
  while ((match = attrRegex.exec(prefix)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) {
    // Check for Angular/Svelte bindings without quotes
    const noQuoteRegex = /(?:\[class\.|class:)([a-zA-Z0-9\-\@\:]*)$/i;
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

  // If the insideString contains the matching quote, it means the attribute was closed before the cursor
  if (insideString.includes(quote)) {
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

export const MAPLE_CLASS_REGEX =
  /[\w\-@:\[\]\#\.\%\|_\/\(\)\,\=\!\^\&\>\<\~\+\*\;\'\"]+/g;
export const MAPLE_CLASS_REGEX_NON_GLOBAL =
  /[\w\-@:\[\]\#\.\%\|_\/\(\)\,\=\!\^\&\>\<\~\+\*\;\'\"]+/;
