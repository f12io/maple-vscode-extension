export interface Token {
  value: string;
  start: number;
  end: number;
}

export function tokenizeClassesWithIndices(str: string): Array<Token> {
  const tokens: Array<Token> = [];
  let currentToken = '';
  let braceDepth = 0;
  let parenDepth = 0;
  let tokenStart = -1;
  let inString = false;
  let quoteChar: string | null = null;
  let isEscaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const nextChar = str[i + 1];

    if (braceDepth === 0 && parenDepth === 0 && char.trim() === '') {
      if (currentToken) {
        tokens.push({
          value: currentToken,
          start: tokenStart,
          end: i,
        });
        currentToken = '';
        tokenStart = -1;
      }
      continue;
    }

    if (currentToken === '') {
      tokenStart = i;
    }

    if (braceDepth > 0 || parenDepth > 0) {
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
        } else if (char === '{' && braceDepth > 0) {
          braceDepth++;
        } else if (char === '}' && braceDepth > 0) {
          braceDepth--;
        } else if (char === '(' && parenDepth > 0) {
          parenDepth++;
        } else if (char === ')' && parenDepth > 0) {
          parenDepth--;
        }
      }
      currentToken += char;
      continue;
    }

    if (char === '$' && nextChar === '{') {
      braceDepth++;
      currentToken += '${';
      i++;
      continue;
    }

    if (char === '@' && nextChar === '(') {
      parenDepth++;
      currentToken += '@(';
      i++;
      continue;
    }

    if (char === '<' && nextChar === '?') {
      const phpEnd = str.indexOf('?>', i + 2);
      if (phpEnd !== -1) {
        currentToken += str.substring(i, phpEnd + 2);
        i = phpEnd + 1;
        continue;
      }
    }

    currentToken += char;
  }

  if (currentToken) {
    tokens.push({
      value: currentToken,
      start: tokenStart,
      end: str.length,
    });
  }

  return tokens;
}
