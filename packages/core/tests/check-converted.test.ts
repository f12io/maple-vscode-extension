import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkConverted, computeSemanticTokens } from '../src/index';

/** How many times the engine's `convert` was reached, throws included. */
let convertCalls = 0;

// The engine may throw on malformed input rather than return nothing. Node
// input we can construct doesn't reliably reproduce it, so the failure is
// injected here instead.
vi.mock('@f12io/maple', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@f12io/maple')>();
  return {
    ...actual,
    convert: (cls: string) => {
      convertCalls++;
      if (cls.includes('boom')) throw new Error('engine exploded');
      return actual.convert(cls);
    },
  };
});

describe('checkConverted', () => {
  beforeEach(() => {
    convertCalls = 0;
  });

  it('reports a class the engine throws on as unconvertible', () => {
    expect(() => checkConverted('p-boom')).not.toThrow();
    expect(checkConverted('p-boom')).toBe(false);
  });

  it('still reports convertible classes', () => {
    expect(checkConverted('p-4')).toBe(true);
  });

  it('caches the throw instead of re-running the engine', () => {
    checkConverted('m-boom');
    checkConverted('m-boom');
    expect(convertCalls).toBe(1);
  });

  it('keeps one bad word from taking down the whole document', () => {
    const tokens = computeSemanticTokens('<div class="p-boom d-flex"></div>', {
      languageId: 'html',
    });

    expect(tokens.map((t) => t.type)).toEqual([
      'utility',
      'separator',
      'value',
    ]);
    expect(tokens[0].start).toBe('<div class="p-boom '.length);
  });
});
