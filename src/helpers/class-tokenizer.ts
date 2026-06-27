export interface Token {
  value: string;
  start: number;
  end: number;
}

/**
 * Tokenizes a class string into individual tokens while respecting JavaScript expressions,
 * PHP tags, and Razor/Blazor parentheses. This ensures that spaces inside expressions
 * (like ternary operators) do not prematurely split a class.
 */
export function tokenizeClassesWithIndices(str: string): Array<Token> {
  const tokens: Array<Token> = [];
  let currentToken = '';

  // Track depth to prevent splitting by space inside expressions
  let braceDepth = 0; // For ${...}
  let parenDepth = 0; // For @(...)

  let tokenStart = -1;

  // Track string literals inside expressions to avoid mismatched braces/parens
  let inString = false;
  let quoteChar: string | null = null;
  let isEscaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const nextChar = str[i + 1];

    // If we are at the root level (not inside an expression) and hit whitespace,
    // that marks the end of the current token.
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

    // If we are currently inside an expression, we need to track strings and nested depths
    if (braceDepth > 0 || parenDepth > 0) {
      if (inString) {
        // Handle escaped quotes inside strings
        if (isEscaped) {
          isEscaped = false;
        } else if (char === '\\') {
          isEscaped = true;
        } else if (char === quoteChar) {
          inString = false; // Exiting the string literal
        }
      } else {
        // Look for the start of a string literal
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

    // Entering a JavaScript template interpolation
    if (char === '$' && nextChar === '{') {
      braceDepth++;
      currentToken += '${';
      i++;
      continue;
    }

    // Entering a Razor/Blazor expression
    if (char === '@' && nextChar === '(') {
      parenDepth++;
      currentToken += '@(';
      i++;
      continue;
    }

    // Entering a PHP tag (e.g., <?php ... ?> or <?= ... ?>)
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
