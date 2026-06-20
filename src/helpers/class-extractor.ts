export interface ClassInstance {
  value: string;
  start: number; // Absolute offset in document
  end: number;
  tagName?: string;
}

function getTagNameBackwards(text: string, index: number): string | undefined {
  const prefix = text.substring(0, index);
  const lastOpen = prefix.lastIndexOf("<");
  const lastClose = prefix.lastIndexOf(">");
  if (lastOpen !== -1 && lastOpen > lastClose) {
    const match = text.substring(lastOpen + 1).match(/^\s*([a-zA-Z0-9\-]+)/);
    if (match) {
      return match[1].toLowerCase();
    }
  }
  return undefined;
}

export function extractAllClasses(text: string): ClassInstance[] {
  const instances: ClassInstance[] = [];

  // 1. Standard attributes: class="", className="", CssClass=""
  // Must be preceded by space or start of tag to avoid matching the "class" inside ":class" or "[class]"
  // Also support React template literals: className={\`...\`}
  const attrRegex =
    /(?:^|[\s<>])(?:class|className|CssClass)\s*=\s*(["'])([\s\S]*?)\1|(?:^|[\s<>])className\s*=\s*\{\s*`([^`]*)`\s*\}/gi;
  let match;
  while ((match = attrRegex.exec(text)) !== null) {
    const value = match[2] || match[3];
    const valueMatchStr = match[1]
      ? match[1] + value + match[1]
      : `\`${value}\``;
    const start = match.index + match[0].indexOf(valueMatchStr) + 1; // +1 to skip the quote/backtick
    instances.push({
      value: value,
      start: start,
      end: start + value.length,
      tagName: getTagNameBackwards(text, match.index),
    });
  }

  // 2. Angular / Vue / React expressions: [ngClass]="...", :class="...", [class]="...", className={...}
  // This matches the container of the expression
  // We use this for objects, arrays, and ternaries where classes are inside strings: :class="{ 'c-red': isActive }"
  const exprRegex =
    /(?:\[ngClass\]|:class|\[class\])\s*=\s*(["'])([\s\S]*?)\1|className\s*=\s*\{\s*(["'])([\s\S]*?)\3\s*\}/gi;
  while ((match = exprRegex.exec(text)) !== null) {
    const expr = match[2] || match[4];
    const exprStart = match.index + match[0].indexOf(expr);

    // Find all string literals inside the expression: '...', "...", `...`
    const stringLiteralRegex = /(["'`])([\s\S]*?)\1/g;
    let strMatch;
    while ((strMatch = stringLiteralRegex.exec(expr)) !== null) {
      const quoteIdx = strMatch[0].indexOf(strMatch[1]);
      const start = exprStart + strMatch.index + quoteIdx + 1;
      instances.push({
        value: strMatch[2],
        start: start,
        end: start + strMatch[2].length,
        tagName: getTagNameBackwards(text, match.index),
      });
    }
  }

  // 3. Angular Host Bindings: host: { 'class': '...', '[class.xxx]': 'true' }
  const hostRegex = /host\s*:\s*\{([^}]+)\}/g;
  while ((match = hostRegex.exec(text)) !== null) {
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
    instances.push({
      value: match[1],
      start: match.index + match[0].indexOf(match[1]),
      end: match.index + match[0].indexOf(match[1]) + match[1].length,
      tagName: getTagNameBackwards(text, match.index),
    });
  }

  // 5. Angular `<html --alias-btn="...">`
  // Wait, the user has aliases on html: `<html class="--alias-btn=...">`
  // That is covered by `class="..."`.

  return instances;
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
    lastMatch[1] || lastMatch[2] || lastMatch[3] || lastMatch[4] || "`";

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
  let currentWord = wordRange ? document.getText(wordRange) : "";

  if (!wordRange) {
    return { wordRange: undefined, currentWord: "" };
  }

  const cursorOffsetInWord = position.character - wordRange.start.character;
  const tokens = currentWord.split(/(["'\s])/);
  let currentOffset = 0;

  let finalRange = wordRange;
  let finalWord = "";

  for (const token of tokens) {
    const start = currentOffset;
    const end = currentOffset + token.length;

    if (cursorOffsetInWord > start && cursorOffsetInWord <= end) {
      if (token !== '"' && token !== "'" && token.trim() !== "") {
        finalWord = token;
        finalRange = wordRange.with(
          wordRange.start.translate(0, start),
          wordRange.start.translate(0, end),
        );
      } else {
        finalRange = undefined;
        finalWord = "";
      }
      break;
    } else if (cursorOffsetInWord === 0 && start === 0) {
      if (token !== '"' && token !== "'" && token.trim() !== "") {
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
    const cleanWord = finalWord.replace(/[><]+$/, "").replace(/<![\-]*$/, "");
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
