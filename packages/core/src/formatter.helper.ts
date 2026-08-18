import { LEADING_WHITESPACE_REGEX, TRAILING_WHITESPACE_REGEX } from './regex';

/** Which edges of a string literal are welded to a neighbouring operand. */
export interface LiteralSeams {
  start: boolean;
  end: boolean;
}

/**
 * Reports, for each edge of the literal at [start, end), whether the region
 * concatenates something onto it, per the host language's
 * `concatenationOperators`. Anything else next to a literal — an argument
 * comma, a ternary `?`/`:`, an object key's colon, the edge of the region —
 * leaves the literal a class list of its own.
 *
 * Only the nearest non-whitespace character inside the region is consulted,
 * which is all a concatenation can hide behind.
 */
export function findLiteralSeams(
  text: string,
  regionStart: number,
  regionEnd: number,
  start: number,
  end: number,
  operators: ReadonlyArray<string>,
): LiteralSeams {
  let before = start - 1;
  while (before >= regionStart && /\s/.test(text[before])) before--;

  let after = end;
  while (after < regionEnd && /\s/.test(text[after])) after++;

  return {
    start: before >= regionStart && operators.includes(text[before]),
    end: after < regionEnd && operators.includes(text[after]),
  };
}

/**
 * Adjusts the leading and trailing whitespace of formatted class text to match
 * the original string, preserving concatenation seams to avoid unintentionally
 * merging or splitting adjacent classes.
 */
export function preserveEdgeWhitespace(
  original: string,
  formatted: string,
  seams: LiteralSeams = { start: false, end: false },
): string {
  // An all-whitespace literal is a pure separator (`a() + ' ' + b()`); there
  // is no class list in it to format, so it stays as written.
  if (original.trim() === '') return original;

  let result = formatted;

  const lead = original.match(LEADING_WHITESPACE_REGEX)?.[0];
  if (lead === undefined) {
    if (seams.start) result = result.replace(LEADING_WHITESPACE_REGEX, '');
  } else if (!LEADING_WHITESPACE_REGEX.test(result)) {
    result = lead + result;
  }

  const trail = original.match(TRAILING_WHITESPACE_REGEX)?.[0];
  if (trail === undefined) {
    if (seams.end) result = result.replace(TRAILING_WHITESPACE_REGEX, '');
  } else if (!TRAILING_WHITESPACE_REGEX.test(result)) {
    result = result + trail;
  }

  return result;
}
