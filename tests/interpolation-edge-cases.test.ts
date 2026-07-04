import { describe, expect, it } from 'vitest';
import { formatClasses } from '../src/providers/FormatterProvider';
import { LanguageServiceRegistry } from '../src/services/LanguageServiceRegistry';

function extract(languageId: string, text: string) {
  const service = LanguageServiceRegistry.getService(languageId)!;
  const instances = service.extractClasses(text);
  return {
    service,
    instances,
    values: instances.map((i) => i.value),
    tokens: instances.flatMap((i) =>
      service.tokenizeClassesWithIndices(i.value).map((t) => t.value),
    ),
  };
}

describe('Razor interpolation edge cases', () => {
  it('keeps the escaped @@ transition intact as literal text', () => {
    const { values, tokens } = extract(
      'razor',
      '<div class="@@md:flex p-4">',
    );

    // @@ is Razor's escape for a literal @; the attribute text must not be
    // split at the second @ as if it started an implicit expression.
    expect(values).toContain('@@md:flex p-4');
    expect(tokens).toContain('@@md:flex');
    expect(tokens).toContain('p-4');
    expect(tokens).not.toContain(':flex');
  });

  it('consumes member access in implicit expressions (@Model.Css)', () => {
    const { values, tokens } = extract('razor', '<div class="@Model.Css p-4">');

    // .Css belongs to the C# expression and must not leak into class text
    expect(tokens).not.toContain('.Css');
    expect(tokens).toContain('p-4');
    expect(values.some((v) => v.includes('.Css'))).toBe(false);
  });

  it('consumes method calls and indexers in implicit expressions', () => {
    const { tokens } = extract(
      'razor',
      '<div class="@GetCss(item).Trim() m-2 @items[0] p-4">',
    );

    expect(tokens).not.toContain('.Trim()');
    expect(tokens).toContain('m-2');
    expect(tokens).toContain('p-4');
  });

  it('handles parens inside ternary string arms', () => {
    const { values, tokens } = extract(
      'razor',
      '<div class="@(x ? "a)b" : "p-4") m-2">',
    );

    // The ) inside "a)b" must not terminate the @(...) expression
    expect(values).toContain('a)b');
    expect(values).toContain('p-4');
    expect(tokens).toContain('m-2');
  });

  it('preserves maple brace parameters in razor attribute text', () => {
    const { values, tokens } = extract(
      'razor',
      '<div class="gtc-{1fr,2fr} p-4">',
    );

    // Top-level braces in Razor markup are literal text, not C# interpolation
    expect(values).toContain('gtc-{1fr,2fr} p-4');
    expect(tokens).toContain('gtc-{1fr,2fr}');
    expect(tokens).toContain('p-4');
  });

  it('treats {{ }} escapes inside interpolated strings as literal text', () => {
    const { values, tokens } = extract(
      'razor',
      '<div class="@(x ? $"p-{pad} {{lit}}" : "m-0")">',
    );

    expect(values).toContain('p-');
    expect(values).toContain('m-0');
    // The escaped braces stay attached to their surrounding text instead of
    // producing spurious empty/whitespace instances
    expect(values.some((v) => v.includes('{{lit}}'))).toBe(true);
    expect(tokens).not.toContain('literal}}');
  });

  it('treats C# whitespace escapes in $" strings as class separators', () => {
    // In a non-verbatim interpolated string \t renders as a tab, so
    // $"fs-50\tm-2 p-1" produces THREE classes at runtime
    const { values, tokens } = extract(
      'razor',
      '<div class="@(x ? $"fs-50\\tm-2 p-1" : "c-red")">',
    );

    expect(values).toContain('fs-50');
    expect(tokens).toContain('m-2');
    expect(tokens).toContain('p-1');
    expect(values).toContain('c-red');
    expect(values.some((v) => v.includes('\\t'))).toBe(false);
  });

  it('extracts holes from verbatim interpolated strings ($@"...")', () => {
    // $@" was previously scanned as a plain string ending at the first inner
    // quote; the service-owned matcher parses it like $" (with holes)
    const { values, tokens } = extract(
      'razor',
      '<div class="@(x ? $@"p-2 w-{(y ? "5" : "10")} m-4" : "c-red")">',
    );

    expect(values.some((v) => v.includes('p-2 w-'))).toBe(true);
    expect(tokens).toContain('p-2');
    expect(tokens).toContain('m-4');
    expect(values).toContain('c-red');
  });

  it('keeps non-whitespace C# escapes attached to their token', () => {
    // \\ is an escaped backslash (literal \), not a separator
    const { values } = extract(
      'razor',
      '<div class="@(x ? $"p-1 fs-50\\\\tm-2" : "c-red")">',
    );

    expect(values.some((v) => v.includes('p-1'))).toBe(true);
    // The \\t sequence is a literal backslash + t, not a tab: no split
    expect(values.some((v) => v.includes('fs-50\\\\tm-2'))).toBe(true);
  });

  it('does not rewrite escape-bearing $" strings to verbatim when formatting', () => {
    const input =
      '@(x ? $"fs-50\\tm-2 p-1 bgc-red o-50 c-white" : "fs-60") p-1 m-1 o-50 c-red fw-bold';
    const result = formatClasses(input, '  ', 4, 'razor');

    // Upgrading $"...\t..." to $@"...\t..." would change the C# runtime value
    // (verbatim strings do not process backslash escapes), so the string must
    // be left exactly as written.
    expect(result).toContain('$"fs-50\\tm-2 p-1 bgc-red o-50 c-white"');
    expect(result).not.toContain('$@"fs-50');
  });
});

describe('JavaScript/Svelte interpolation edge cases', () => {
  it('js: handles braces inside strings in ${...} expressions', () => {
    const { values, tokens } = extract(
      'javascript',
      `<div class="p-2 m-\${cond ? 'a}b' : 'x-1'} o-50">`,
    );

    // The } inside 'a}b' must not terminate the ${...} interpolation
    expect(values).toContain('a}b');
    expect(values).toContain('x-1');
    expect(tokens).toContain('o-50');
  });

  it('svelte: handles braces inside strings in {...} expressions', () => {
    const { values, tokens } = extract(
      'svelte',
      `<div class="p-2 {cond ? 'a}b' : 'x-1'} o-50">`,
    );

    expect(values).toContain('a}b');
    expect(values).toContain('x-1');
    expect(tokens).toContain('o-50');
  });

  it('svelte: handles template literals inside {...} expressions', () => {
    const { values, tokens } = extract(
      'svelte',
      '<div class="p-2 {cond ? `a}b` : \'x-1\'} o-50">',
    );

    expect(values).toContain('a}b');
    expect(values).toContain('x-1');
    expect(tokens).toContain('o-50');
  });
});

describe('/* maple */ opt-in interpolation', () => {
  it('razor: opts in C# interpolated strings ($"...")', () => {
    const { values, tokens } = extract(
      'razor',
      'var cls = /* maple */ $"p-2 w-{width} m-4";',
    );

    // The {width} hole splits the classes; both sides survive
    expect(values.some((v) => v.includes('p-2 w-'))).toBe(true);
    expect(tokens).toContain('p-2');
    expect(tokens).toContain('m-4');
  });

  it('razor: applies whitespace-escape splitting in opted-in $" strings', () => {
    const { values, tokens } = extract(
      'razor',
      'var cls = /* maple */ $"fs-50\\tm-2 p-1";',
    );

    expect(values).toContain('fs-50');
    expect(tokens).toContain('m-2');
    expect(values.some((v) => v.includes('\\t'))).toBe(false);
  });

  it('razor: opts in plain double-quoted strings', () => {
    const { values } = extract(
      'razor',
      'var cls = /* maple */ "p-2 m-4 c-red";',
    );

    expect(values).toContain('p-2 m-4 c-red');
  });

  it('php: opts in plain single-quoted strings', () => {
    const { values } = extract(
      'php',
      "<?php $cls = /* maple */ 'p-2 m-4 c-red'; ?>",
    );

    expect(values).toContain('p-2 m-4 c-red');
  });

  it('razor: one opt-in covers both ternary arms', () => {
    const { tokens } = extract(
      'razor',
      'var cls = /* maple */ isActive ? $@"fs-50 m-{pad} bgc-red" : $@"fs-60 o-50";',
    );

    // The opt-in marks the whole expression, not just the first literal
    expect(tokens).toContain('fs-50');
    expect(tokens).toContain('bgc-red');
    expect(tokens).toContain('fs-60');
    expect(tokens).toContain('o-50');
  });

  it('php: one opt-in covers all literals in a concatenation', () => {
    const { values } = extract(
      'php',
      "<?php $cls = /* maple */ 'p-2 m-' . $pad . ' o-50'; ?>",
    );

    expect(values).toContain('p-2 m-');
    expect(values).toContain(' o-50');
  });

  it('js: opt-in region stops at the statement semicolon', () => {
    const { values } = extract(
      'javascript',
      "const a = /* maple */ cond ? 'p-2' : 'm-4'; const b = 'x-9';",
    );

    expect(values).toContain('p-2');
    expect(values).toContain('m-4');
    expect(values).not.toContain('x-9');
  });

  it('js: opt-in region stops at the next assignment without semicolons', () => {
    const { values } = extract(
      'javascript',
      "const a = /* maple */ 'p-2'\nconst b = 'x-9'\n",
    );

    expect(values).toContain('p-2');
    expect(values).not.toContain('x-9');
  });

  it('js: opt-in region stops at a top-level comma', () => {
    const { values } = extract(
      'javascript',
      "register(/* maple */ 'p-2', 'x-9');",
    );

    expect(values).toContain('p-2');
    expect(values).not.toContain('x-9');
  });

  it('js: handles braces inside strings in opted-in template literals', () => {
    const { values, tokens } = extract(
      'javascript',
      "const cls = /* maple */ `p-2 ${cond ? 'a}b' : 'x-1'} o-50`;",
    );

    expect(values).toContain('a}b');
    expect(values).toContain('x-1');
    expect(tokens).toContain('o-50');
  });
});

describe('PHP interpolation edge cases', () => {
  it('ignores ?> inside string literals when finding the close tag', () => {
    const { values, tokens } = extract(
      'php',
      `<div class="<?= $a ? 'x?>y' : 'p-4' ?> m-2">`,
    );

    // The ?> inside 'x?>y' must not terminate the PHP block
    expect(values).toContain('x?>y');
    expect(values).toContain('p-4');
    expect(tokens).toContain('m-2');
    expect(tokens).not.toContain('?>');
    expect(tokens).not.toContain("y'");
  });

  it('does not corrupt ternaries with ?> in strings when formatting', () => {
    const input =
      "<?= $a ? 'x?>y p-1 p-2 p-3 p-4 p-5' : 'z' ?> m-1 m-2 o-50 c-red fw-bold";
    const result = formatClasses(input, '  ', 4, 'php');

    // All classes survive and the ternary keeps its real terminator
    expect(result).toContain('x?>y');
    expect(result).toContain('p-5');
    expect(result).toContain("'z' ?>");
  });

  it('keeps float literals in concatenation expressions intact', () => {
    const { values, tokens } = extract(
      'php',
      `<div class="<?= 'p-' . 1.5 ?> m-2">`,
    );

    expect(values).toContain('p-');
    expect(tokens).toContain('m-2');
  });
});
