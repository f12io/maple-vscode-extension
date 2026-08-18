import { formatText } from '@f12io/maple-language-core';
import { describe, expect, it } from 'vitest';
import { LanguageServiceRegistry } from '../src/services/LanguageServiceRegistry';

/**
 * Per-format extraction coverage: every construct each supported language
 * contributes, asserted on the values the extractor reports.
 *
 * Splitting is meaningful here. A class attribute holding an interpolation is
 * reported as the literal runs around it, so `"{{ a }} p-4"` becomes `''` and
 * `' p-4'` — the empty run and the leading space are the real offsets the
 * editor highlights, not artefacts.
 */

const service = (languageId: string) =>
  LanguageServiceRegistry.getService(languageId)!;

const classes = (languageId: string, text: string) =>
  service(languageId)
    .extractClasses(text)
    .map((instance) => instance.value);

/**
 * Builds an element rather than writing one out. The formatter now skips
 * markup quoted in a string, so this is a guard rather than a necessity —
 * interpolating the value keeps the matcher off this file regardless of how
 * the samples grow.
 */
const el = (value: string, tag = 'div') =>
  `<${tag} class="${value}">x</${tag}>`;

describe('HTML', () => {
  it('extracts a class attribute', () => {
    expect(classes('html', '<div class="p-4 c-red">x</div>')).toEqual([
      'p-4 c-red',
    ]);
  });

  it('accepts single quotes', () => {
    expect(classes('html', "<div class='p-4'>x</div>")).toEqual(['p-4']);
  });

  it('accepts the CssClass attribute', () => {
    expect(classes('html', '<asp:Label CssClass="p-4" />')).toEqual(['p-4']);
  });

  it('extracts every element in document order', () => {
    const text = '<div class="a"><span class="b"></span></div>';
    expect(classes('html', text)).toEqual(['a', 'b']);
  });

  it('keeps the whitespace of a multi-line attribute', () => {
    const text = el('\n  p-4\n  c-red\n');
    expect(classes('html', text)).toEqual(['\n  p-4\n  c-red\n']);
  });

  it('splits a class attribute around an interpolation', () => {
    expect(classes('html', '<div class="{{ theme }} p-4">x</div>')).toEqual([
      '',
      ' p-4',
    ]);
  });

  it('extracts an alias definition on the html element', () => {
    const text = '<html class="--alias-btn=p-4;c-red">x</html>';
    expect(classes('html', text)).toEqual(['--alias-btn=p-4;c-red']);
  });

  it('is not confused by other quoted attributes', () => {
    const text = '<div class="p-4" title="he said &quot;hi&quot;">x</div>';
    expect(classes('html', text)).toEqual(['p-4']);
  });

  it('ignores an unterminated attribute', () => {
    // The attribute name is interpolated so this file never contains the
    // literal: an unterminated attribute makes the formatter scan on for a
    // closing quote, which would swallow everything below it
    const attr = 'class';
    const text = `<div ${attr}="p-4>x</div>`;
    expect(classes('html', text)).toEqual([]);
  });
});

describe('React and Solid', () => {
  const langs = ['javascriptreact', 'typescriptreact'];

  // Built rather than written out: a source file containing `className={...}`
  // verbatim gets rewritten by the maple prettier plugin even when it only
  // appears inside a string literal, which corrupts this file.
  const jsxExpr = (attr: string, expr: string) =>
    `<div ${attr}={${expr}}>x</div>`;

  it.each(langs)('%s extracts a className string', (lang) => {
    expect(classes(lang, '<div className="p-4">x</div>')).toEqual(['p-4']);
  });

  it.each(langs)('%s extracts a className expression string', (lang) => {
    expect(classes(lang, "<div className={'p-4'}>x</div>")).toEqual(['p-4']);
  });

  it.each(langs)('%s extracts both arms of a ternary', (lang) => {
    const text = "<div className={cond ? 'a-1' : 'b-2'}>x</div>";
    expect(classes(lang, text)).toEqual(['a-1', 'b-2']);
  });

  it.each(langs)('%s extracts clsx arguments and object keys', (lang) => {
    const text = "<div className={clsx('a-1', { 'b-2': x })}>x</div>";
    expect(classes(lang, text)).toEqual(['a-1', 'b-2']);
  });

  it.each(langs)('%s extracts a solid classList object', (lang) => {
    expect(classes(lang, "<div classList={{ 'a-1': x }}>y</div>")).toEqual([
      'a-1',
    ]);
  });

  it.each(langs)('%s splits a template literal around holes', (lang) => {
    const text = jsxExpr('className', '`a-1 ${cond ? "b-2" : "c-3"} d-4`');
    expect(classes(lang, text)).toEqual(['a-1 ', 'b-2', 'c-3', ' d-4']);
  });

  it.each(langs)('%s accepts a plain class attribute too', (lang) => {
    expect(classes(lang, '<div class="p-4">x</div>')).toEqual(['p-4']);
  });

  it('reads the component name as the tag', () => {
    const [instance] = service('typescriptreact').extractClasses(
      '<MyComp className="p-4" />',
    );
    expect(instance.tagName).toBe('mycomp');
  });
});

describe('Vue', () => {
  it('extracts a static class', () => {
    expect(classes('vue', '<div class="p-4">x</div>')).toEqual(['p-4']);
  });

  it('extracts the keys of an object binding', () => {
    const text = `<span :class="{ 'c-white': a, 'c-gray-500': !a }">x</span>`;
    expect(classes('vue', text)).toEqual(['c-white', 'c-gray-500']);
  });

  it('extracts both arms inside an array binding', () => {
    const text = `<b :class="[a ? 'r-1' : 'g-2']">x</b>`;
    expect(classes('vue', text)).toEqual(['r-1', 'g-2']);
  });

  it('extracts a v-bind:class shorthand expansion', () => {
    expect(classes('vue', `<div v-bind:class="{ 'a-1': x }">y</div>`)).toEqual([
      'a-1',
    ]);
  });

  it('splits a class attribute around an interpolation', () => {
    expect(classes('vue', '<div class="{{ theme }} p-4">x</div>')).toEqual([
      '',
      ' p-4',
    ]);
  });

  it('leaves ordinary script strings alone', () => {
    const text = `<script>\nexport default { data: () => ({ msg: 'p-4' }) };\n</script>`;
    expect(classes('vue', text)).toEqual([]);
  });
});

describe('Svelte', () => {
  it('extracts a static class', () => {
    expect(classes('svelte', '<div class="p-4">x</div>')).toEqual(['p-4']);
  });

  it('extracts a class directive name', () => {
    expect(
      classes('svelte', '<span class:c-white={isActive}>x</span>'),
    ).toEqual(['c-white']);
  });

  it('extracts both arms of a class expression', () => {
    const text = "<button class={a ? 'r-1' : 'g-2'}>x</button>";
    expect(classes('svelte', text)).toEqual(['r-1', 'g-2']);
  });

  it('splits an attribute mixing an expression with static classes', () => {
    const text = el("{a ? 'r-1' : 'g-2'} static-1");
    expect(classes('svelte', text)).toEqual(['', 'r-1', 'g-2', ' static-1']);
  });

  it('extracts clsx arguments', () => {
    const text = "<div class={clsx('a-1', { 'b-2': x })}>y</div>";
    expect(classes('svelte', text)).toEqual(['a-1', 'b-2']);
  });

  it('extracts inside a block', () => {
    expect(classes('svelte', '{#if a}<div class="p-4">x</div>{/if}')).toEqual([
      'p-4',
    ]);
  });
});

describe('Angular in templates', () => {
  it('extracts ngClass object keys', () => {
    const text = `<div [ngClass]="{ 'o-50': isDim }">x</div>`;
    expect(classes('html', text)).toEqual(['o-50']);
  });

  it('extracts a specific class binding', () => {
    expect(classes('html', '<span [class.fw-bold]="isBold"></span>')).toEqual([
      'fw-bold',
    ]);
  });

  it('extracts both arms of a class expression binding', () => {
    const text = `<div [class]="a ? 'r-1' : 'g-2'">x</div>`;
    expect(classes('html', text)).toEqual(['r-1', 'g-2']);
  });

  it('is unaffected by a structural directive on the element', () => {
    expect(classes('html', '<div *ngIf="a" class="p-4">x</div>')).toEqual([
      'p-4',
    ]);
  });
});

describe('Angular in TypeScript', () => {
  it('extracts from an inline template', () => {
    const text = 'template: `<div class="p-4">x</div>`';
    expect(classes('typescript', text)).toEqual(['p-4']);
  });

  it('extracts a host class', () => {
    const text = "@Component({ host: { class: 'd-flex m-2' } })";
    expect(classes('typescript', text)).toEqual(['d-flex m-2']);
  });

  it('extracts a host class binding', () => {
    const text = `@Component({ host: { '[class.fx-1]': 'isActive' } })`;
    expect(classes('typescript', text)).toEqual(['fx-1']);
  });

  it('extracts a class binding inside an inline template', () => {
    const text =
      '@Component({ template: `<span [class.fw-bold]="b"></span>` })';
    expect(classes('typescript', text)).toEqual(['fw-bold']);
  });

  it('extracts ngClass inside an inline template', () => {
    const text =
      '@Component({ template: `<div [ngClass]="{ \'o-50\': d }"></div>` })';
    expect(classes('typescript', text)).toEqual(['o-50']);
  });

  it('is not thrown by an attribute selector on the component', () => {
    const text = [
      '@Component({',
      "  selector: 'article[app-page-static]',",
      '  template: `<div class="p-4">x</div>`,',
      '})',
    ].join('\n');
    expect(classes('typescript', text)).toEqual(['p-4']);
  });
});

describe('JavaScript and TypeScript', () => {
  const langs = ['javascript', 'typescript'];

  it.each(langs)('%s opts in a string', (lang) => {
    expect(classes(lang, "const s = /* maple */ 'fw-bold c-red';")).toEqual([
      'fw-bold c-red',
    ]);
  });

  it.each(langs)('%s opts in both ternary arms', (lang) => {
    expect(classes(lang, "const s = /* maple */ a ? 'r-1' : 'g-2';")).toEqual([
      'r-1',
      'g-2',
    ]);
  });

  it.each(langs)('%s opts in object keys', (lang) => {
    const text = "const s = /* maple */ { 'c-red': a, p4: true };";
    expect(classes(lang, text)).toEqual(['c-red', 'p4']);
  });

  it.each(langs)('%s splits an opted-in template literal', (lang) => {
    const text = 'const s = /* maple */ `a-1 ${x ? "b-2" : "c-3"} d-4`;';
    expect(classes(lang, text)).toEqual(['a-1 ', 'b-2', 'c-3', ' d-4']);
  });

  it.each(langs)('%s extracts clsx without an opt-in', (lang) => {
    expect(classes(lang, "const s = clsx('a-1', { 'b-2': x });")).toEqual([
      'a-1',
      'b-2',
    ]);
  });

  it.each(langs)('%s leaves an unmarked string alone', (lang) => {
    expect(classes(lang, "const s = 'fw-bold c-red';")).toEqual([]);
  });

  it('extracts cva class values without its schema keys', () => {
    // clsx and classNames take `{ 'c-red': cond }`, where the key is the
    // class, so their object keys are read. cva's keys name its schema, so
    // they are not.
    // The call name is interpolated so this file does not itself look like a
    // cva call to the formatter
    const fn = 'cva';
    const text = [
      `const s = ${fn}('base-1', {`,
      "  variants: { intent: { primary: 'bgc-blue-500 c-white' } },",
      '});',
    ].join('\n');
    expect(classes('typescript', text)).toEqual([
      'base-1',
      'bgc-blue-500 c-white',
    ]);
  });
});

describe('Razor', () => {
  const langs = ['razor', 'aspnetcorerazor'];

  it.each(langs)('%s extracts a static class with an escape', (lang) => {
    const text = '<div class="bgc-green-500 @@md:p-2">x</div>';
    expect(classes(lang, text)).toEqual(['bgc-green-500 @@md:p-2']);
  });

  it.each(langs)('%s splits around a parenthesised expression', (lang) => {
    const text = el('@(a ? "c-white" : "c-gray-500")', 'span');
    expect(classes(lang, text)).toEqual(['', 'c-white', 'c-gray-500', '']);
  });

  it.each(langs)('%s splits around an implicit expression', (lang) => {
    expect(classes(lang, '<div class="p-4 @extraClass">x</div>')).toEqual([
      'p-4 ',
      '',
    ]);
  });

  it.each(langs)('%s reads an interpolated C# string', (lang) => {
    const text = el('@(x ? $"fs-50 p-1" : "fs-60")');
    expect(classes(lang, text)).toEqual(['', 'fs-50 p-1', 'fs-60', '']);
  });

  it.each(langs)('%s opts in a verbatim string in a code block', (lang) => {
    const text = [
      '@code {',
      '  private string s = /* maple */ $@"',
      '    fs-50',
      '    p-2',
      '  ";',
      '}',
    ].join('\n');
    expect(classes(lang, text)).toEqual(['\n    fs-50\n    p-2\n  ']);
  });

  it('renders the @@ escape as a single @', () => {
    expect(service('razor').getRenderedClassText('@@md:p-2')).toBe('@md:p-2');
  });

  it('leaves @@ alone in html, where it is not an escape', () => {
    expect(service('html').getRenderedClassText('@@md:p-2')).toBe('@@md:p-2');
  });
});

describe('PHP', () => {
  it('splits around a short echo tag', () => {
    const text = '<div class="p-4 <?= $extra ?>">x</div>';
    expect(classes('php', text)).toEqual(['p-4 ', '']);
  });

  it('extracts both arms of a ternary echo', () => {
    const text = el("<?= $a ? 'c-white' : 'c-gray-500' ?>", 'span');
    expect(classes('php', text)).toEqual(['', 'c-white', 'c-gray-500', '']);
  });

  it('follows string concatenation in an opt-in', () => {
    const text = "<?php $s = /* maple */ 'a-1 ' . ($x ? 'b-2' : 'c-3'); ?>";
    expect(classes('php', text)).toEqual(['a-1 ', 'b-2', 'c-3']);
  });

  it('splits a multi-line attribute around an echo', () => {
    const text = el('\n  bgc-green-500\n  <?= $extra ?>\n');
    expect(classes('php', text)).toEqual(['\n  bgc-green-500\n  ', '\n']);
  });

  it('splits a class fragment interrupted by an echo', () => {
    expect(classes('php', '<div class="m-<?= $n ?>">x</div>')).toEqual([
      'm-',
      '',
    ]);
  });

  it('allows single quotes to hold newlines when reformatting', () => {
    expect(service('php').getMultilineStringDelimiters("'", 'a b')).toEqual({
      open: "'",
      close: "'",
    });
  });
});

describe('Twig', () => {
  it('splits around an interpolation', () => {
    expect(
      classes('twig', '<div class="p-4 {{ extraClass }}">x</div>'),
    ).toEqual(['p-4 ', '']);
  });

  it('extracts both arms of a ternary interpolation', () => {
    const text = el("{{ a ? 'c-white' : 'c-gray-500' }}", 'span');
    expect(classes('twig', text)).toEqual(['', 'c-white', 'c-gray-500', '']);
  });

  it('ignores a set tag', () => {
    const text = '{% set c = "p-4" %}\n<div class="c-red">x</div>';
    expect(classes('twig', text)).toEqual(['c-red']);
  });

  it('extracts inside a for tag', () => {
    const text = '{% for i in items %}<div class="p-4">x</div>{% endfor %}';
    expect(classes('twig', text)).toEqual(['p-4']);
  });
});

describe('Shared behaviour across formats', () => {
  const markup = '<button class="p-4">x</button>';
  const markupLangs = ['html', 'vue', 'svelte', 'razor', 'php', 'twig'];

  it.each(markupLangs)('%s reports the enclosing tag name', (lang) => {
    const [instance] = service(lang).extractClasses(markup);
    expect(instance.tagName).toBe('button');
  });

  it.each(markupLangs)('%s reports offsets into the document', (lang) => {
    const [instance] = service(lang).extractClasses(markup);
    expect(markup.slice(instance.start, instance.end)).toBe('p-4');
  });

  it.each([
    'html',
    'javascriptreact',
    'typescriptreact',
    'vue',
    'svelte',
    'typescript',
    'javascript',
    'razor',
    'aspnetcorerazor',
    'php',
    'twig',
  ])('%s is registered', (lang) => {
    expect(LanguageServiceRegistry.isSupported(lang)).toBe(true);
    expect(service(lang).extractClasses('')).toEqual([]);
  });

  it('reports nothing for an unsupported language', () => {
    expect(LanguageServiceRegistry.getService('python')).toBeUndefined();
  });
});

describe('Formatting across formats', () => {
  const format = (languageId: string, text: string) =>
    formatText(text, languageId, 4);

  const markupLangs = [
    ['html', 'class'],
    ['vue', 'class'],
    ['svelte', 'class'],
    ['twig', 'class'],
    ['php', 'class'],
    ['razor', 'class'],
    ['aspnetcorerazor', 'class'],
    ['javascriptreact', 'className'],
    ['typescriptreact', 'className'],
  ] as const;

  it.each(markupLangs)('%s wraps an over-limit attribute', (lang, attr) => {
    const text = `<div ${attr}="p-1 p-2 p-3 p-4 p-5 p-6">x</div>`;
    expect(format(lang, text)).toBe(
      `<div ${attr}="\n  p-1 p-2 p-3 p-4\n  p-5 p-6\n">x</div>`,
    );
  });

  it.each(markupLangs)('%s formatting is idempotent', (lang, attr) => {
    const text = `<div ${attr}="p-1 p-2 p-3 p-4 p-5 p-6">x</div>`;
    const once = format(lang, text);
    expect(format(lang, once)).toBe(once);
  });

  it.each(markupLangs)(
    '%s leaves an under-limit attribute alone',
    (lang, attr) => {
      const text = `<div ${attr}="p-1 p-2">x</div>`;
      expect(format(lang, text)).toBe(text);
    },
  );

  it.each(['javascript', 'typescript'])(
    '%s upgrades a quoted opt-in to a template literal',
    (lang) => {
      const text = "const s = /* maple */ 'p-1 p-2 p-3 p-4 p-5 p-6';";
      const out = format(lang, text);
      expect(out).toBe(
        'const s = /* maple */ `\n  p-1 p-2 p-3 p-4\n  p-5 p-6\n`;',
      );
      expect(format(lang, out)).toBe(out);
    },
  );

  it('php keeps single quotes, which hold newlines already', () => {
    const text = "<?php $s = /* maple */ 'p-1 p-2 p-3 p-4 p-5 p-6'; ?>";
    expect(format('php', text)).toBe(
      "<?php $s = /* maple */ '\n  p-1 p-2 p-3 p-4\n  p-5 p-6\n'; ?>",
    );
  });

  it('razor wraps a verbatim string', () => {
    const text = '@{ var s = /* maple */ $@"p-1 p-2 p-3 p-4 p-5 p-6"; }';
    expect(format('razor', text)).toBe(
      '@{ var s = /* maple */ $@"\n  p-1 p-2 p-3 p-4\n  p-5 p-6\n"; }',
    );
  });

  it('razor leaves an escape-bearing string untouched', () => {
    // `$"..."` cannot hold a raw newline once it carries an escape, so the
    // formatter declines rather than corrupt it
    const text = '@{ var s = /* maple */ $"p-1 p-2 p-3 p-4 p-5\\tp-6"; }';
    expect(format('razor', text)).toBe(text);
  });

  it('gives the html element one class per line', () => {
    const text = el(
      '--alias-a=p-1 --alias-b=p-2 --alias-c=p-3 --alias-d=p-4 --alias-e=p-5',
      'html',
    );
    expect(format('html', text)).toBe(
      el(
        '\n  --alias-a=p-1\n  --alias-b=p-2\n  --alias-c=p-3\n  --alias-d=p-4\n  --alias-e=p-5\n',
        'html',
      ),
    );
  });
});

describe('Formatter safety', () => {
  const format = (languageId: string, text: string) =>
    formatText(text, languageId, 4);

  const overLimit = el('p-1 p-2 p-3 p-4 p-5');

  describe('comment directives govern formatting too', () => {
    it.each([
      ['file scope', '<!-- maple-disable-file -->\n'],
      ['block scope', '<!-- maple-disable -->\n'],
      ['next line', '<!-- maple-disable-next-line -->\n'],
    ])('%s leaves the document untouched', (_name, directive) => {
      const text = directive + overLimit;
      expect(format('html', text)).toBe(text);
    });

    it('line scope leaves its own line untouched', () => {
      const text = `${overLimit} <!-- maple-disable-line -->`;
      expect(format('html', text)).toBe(text);
    });

    it('formats the same document without a directive', () => {
      expect(format('html', overLimit)).not.toBe(overLimit);
    });

    it('re-enables after a matching enable directive', () => {
      const text = [
        '<!-- maple-disable -->',
        overLimit,
        '<!-- maple-enable -->',
        overLimit,
      ].join('\n');
      const out = format('html', text);
      expect(out.split('\n')[1]).toBe(overLimit);
      expect(out).toContain('\n  p-1 p-2 p-3 p-4\n');
    });
  });

  describe('markup quoted in a string is left alone', () => {
    it.each([
      ['typescript', `const s = 'x ${overLimit}';`],
      ['javascript', `const s = 'x ${overLimit}';`],
      // A double-quoted host string needs single-quoted attributes, or the
      // attribute's quote would close it. Written as a plain quoted string,
      // not a template literal, so the formatter cannot rewrite this file.
      [
        'typescript',
        'const s = "x <div class=\'p-1 p-2 p-3 p-4 p-5\'>x</div>";',
      ],
      ['php', `<?php $s = 'x ${overLimit}'; ?>`],
    ])('%s leaves a quoted sample untouched', (lang, text) => {
      expect(format(lang, text)).toBe(text);
    });

    it('introduces no newline into a single-line file', () => {
      // A raw newline inside a quoted literal is exactly what breaks the file
      const text = `const s = 'x ${overLimit}';`;
      expect(format('typescript', text).split('\n')).toHaveLength(1);
    });

    it('still formats a template literal, which holds newlines', () => {
      const text = `const t = \`${overLimit}\`;`;
      const out = format('typescript', text);
      expect(out).not.toBe(text);
      expect(out).toContain('\n  p-1 p-2 p-3 p-4\n');
      // Newlines are legal between backticks, so the literal stays closed
      expect(out.split('`')).toHaveLength(3);
    });

    it('still formats an angular inline template', () => {
      const text = ['template: `', `  ${overLimit}`, '`'].join('\n');
      const out = format('typescript', text);
      expect(out).not.toBe(text);
      expect(out).toContain('p-1 p-2 p-3 p-4');
    });

    it('still formats an attribute on its own line', () => {
      const text = '<div\n  class="p-1 p-2 p-3 p-4 p-5"\n>x</div>';
      expect(format('html', text)).not.toBe(text);
    });

    it('still formats an opt-in expression', () => {
      const text = "const s = /* maple */ 'p-1 p-2 p-3 p-4 p-5 p-6';";
      expect(format('typescript', text)).not.toBe(text);
    });
  });
});

/**
 * A string literal concatenated into a class expression is not a class list
 * of its own: the whitespace at its edges is the separator between its last
 * class and the one the neighbour contributes. Both directions of change are
 * silent corruption — dropping the space welds two classes into one
 * (`'p-4 ' + x()` renders `p-4gr`), adding one splits a class in two
 * (`'bgc-red-' + shade()` renders `bgc-red- 500`).
 *
 * Samples are quoted rather than written between backticks for the same
 * reason `jsxExpr` exists: a template literal holding markup is formattable,
 * so the maple prettier plugin would rewrite the samples in this file.
 */
describe('whitespace at a concatenation seam', () => {
  const format = (languageId: string, text: string) =>
    formatText(text, languageId, 4);

  const bound = (attr: string, expr: string) =>
    '<div ' + attr + '="' + expr + '"></div>';

  const seams = [
    ['html', bound('[class]', "'p-4 sm:p-6 ' + (full() ? 'gr' : 'fxrow-sc')")],
    ['html', bound('[ngClass]', "'p-4 ' + x()")],
    ['html', bound('[class]', "a() + ' gr ' + b()")],
    // A literal that is nothing but the separator has no class list to format
    ['html', bound('[class]', "a() + ' ' + b()")],
    ['vue', bound(':class', "'p-4 ' + x")],
    ['twig', bound('class', "{{ 'p-4 ' ~ x }}")],
    ['razor', '<div class="@("p-4 " + x)"></div>'],
    ['svelte', "<div class={'p-4 ' + x}></div>"],
    [
      'javascriptreact',
      "<div className={'p-4 sm:p-6 ' + (full ? 'gr' : 'fxrow-sc')} />",
    ],
    ['typescriptreact', "<div className={clsx('p-4 ', x, ' gr ')} />"],
    // The trim applied to every literal in the region, maple token or not
    ['typescriptreact', "<div className={'not-a-maple-token ' + y()} />"],
    ['javascript', "const c = /* maple */ 'p-4 ' + x();"],
    ['typescript', "const c = clsx('p-4 ', x, ' gr ');"],
    ['php', "<?php $c = /* maple */ 'p-4 ' . $x; ?>"],
  ] as const;

  it.each(seams)('%s keeps the separator the author wrote', (lang, text) => {
    expect(format(lang, text)).toBe(text);
  });

  it('keeps the separator when the literal wraps onto several lines', () => {
    // The newline the wrapped form closes with separates classes just as the
    // space did, so no second separator is added
    const text = "<div className={'p-1 p-2 p-3 p-4 p-5 ' + x} />";
    expect(format('typescriptreact', text)).toBe(
      '<div className={`\n  p-1 p-2 p-3 p-4\n  p-5\n` + x} />',
    );
  });

  const glued = [
    [
      'typescriptreact',
      "<div className={'p-1 p-2 p-3 p-4 bgc-red-' + shade} />",
      '<div className={`\n  p-1 p-2 p-3 p-4\n  bgc-red-` + shade} />',
    ],
    [
      'svelte',
      "<div class={'p-1 p-2 p-3 p-4 bgc-red-' + shade}></div>",
      '<div class={`\n  p-1 p-2 p-3 p-4\n  bgc-red-` + shade}></div>',
    ],
    [
      'javascript',
      "const c = /* maple */ 'p-1 p-2 p-3 p-4 bgc-red-' + shade;",
      'const c = /* maple */ `\n  p-1 p-2 p-3 p-4\n  bgc-red-` + shade;',
    ],
    [
      'php',
      "<?php $c = /* maple */ 'p-1 p-2 p-3 p-4 bgc-red-' . $shade; ?>",
      "<?php $c = /* maple */ '\n  p-1 p-2 p-3 p-4\n  bgc-red-' . $shade; ?>",
    ],
    // A seam on the opening edge is protected the same way
    [
      'typescriptreact',
      "<div className={x + 'p-1 p-2 p-3 p-4 p-5'} />",
      '<div className={x + `p-1 p-2 p-3 p-4\n  p-5\n`} />',
    ],
  ] as const;

  it.each(glued)(
    '%s wraps a glued seam without separating it',
    (lang, text, expected) => {
      expect(format(lang, text)).toBe(expected);
    },
  );

  it('wraps a call argument, whose edges are no seam', () => {
    // clsx joins its arguments with a space; a comma concatenates nothing
    const text = "const c = clsx('p-1 p-2 p-3 p-4 p-5', x);";
    expect(format('javascript', text)).toBe(
      'const c = clsx(`\n  p-1 p-2 p-3 p-4\n  p-5\n`, x);',
    );
  });

  it.each([
    ['html', ['+']],
    ['vue', ['+']],
    ['svelte', ['+']],
    ['javascript', ['+']],
    ['typescript', ['+']],
    ['typescriptreact', ['+']],
    ['razor', ['+']],
    // `.` is PHP's operator, `~` is twig's; both keep `+` because the file
    // also holds the markup's script
    ['php', ['.', '+']],
    ['twig', ['~', '+']],
  ] as const)(
    '%s names the operators that concatenate onto a literal',
    (lang, operators) => {
      expect(service(lang).concatenationOperators).toEqual([...operators]);
    },
  );

  it('reads a member access as no seam, JavaScript concatenating with +', () => {
    const text = "const c = /* maple */ 'p-1 p-2 p-3 p-4 p-5'.trim();";
    expect(format('javascript', text)).toBe(
      'const c = /* maple */ `\n  p-1 p-2 p-3 p-4\n  p-5\n`.trim();',
    );
  });

  it('still trims and collapses a whole class list', () => {
    expect(format('html', '<div class="  p-4   sm:p-6  "></div>')).toBe(
      '<div class="p-4 sm:p-6"></div>',
    );
  });

  it.each([...seams, ...glued.map(([lang, text]) => [lang, text] as const)])(
    '%s formatting is idempotent',
    (lang, text) => {
      const once = format(lang, text);
      expect(format(lang, once)).toBe(once);
    },
  );
});
