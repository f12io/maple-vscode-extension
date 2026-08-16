import { describe, expect, it } from 'vitest';
import { LanguageServiceRegistry } from '../src/services/LanguageServiceRegistry';

describe('Inline Disable Comments', () => {
  it('should skip entire file if maple-disable-file is present', () => {
    const text = `
      /* maple-disable-file */
      const x = <div class="bg-red-500"></div>;
      const y = <span className="text-xl"></span>;
    `;
    const classes =
      LanguageServiceRegistry.getService('html')!.extractClasses(text);
    expect(classes.length).toBe(0);
  });

  it('should skip specific line if maple-disable-line is present', () => {
    const text = `
      const x = <div class="bg-red-500"></div>; // maple-disable-line
      const y = <span className="text-xl"></span>;
    `;
    const classes =
      LanguageServiceRegistry.getService('html')!.extractClasses(text);
    expect(classes.length).toBe(1);
    expect(classes[0].value).toBe('text-xl');
  });

  it('should skip next line if maple-disable-next-line is present', () => {
    const text = `
      // maple-disable-next-line
      const x = <div class="bg-red-500"></div>;
      const y = <span className="text-xl"></span>;
    `;
    const classes =
      LanguageServiceRegistry.getService('html')!.extractClasses(text);
    expect(classes.length).toBe(1);
    expect(classes[0].value).toBe('text-xl');
  });

  it('should skip blocks if maple-disable is used', () => {
    const text = `
      const a = <div class="btn"></div>;
      /* maple-disable */
      const b = <div class="bg-red-500"></div>;
      const c = <span className="text-xl"></span>;
      /* maple-enable */
      const d = <span className="flex"></span>;
    `;
    const classes =
      LanguageServiceRegistry.getService('html')!.extractClasses(text);
    expect(classes.length).toBe(2);
    expect(classes[0].value).toBe('btn');
    expect(classes[1].value).toBe('flex');
  });
});

describe('Directive comment syntaxes', () => {
  const values = (text: string, languageId = 'html') =>
    LanguageServiceRegistry.getService(languageId)!
      .extractClasses(text)
      .map((c) => c.value);

  it.each([
    ['html comment', '<!-- maple-disable-file -->'],
    ['block comment', '/* maple-disable-file */'],
    ['line comment', '// maple-disable-file'],
    ['hash comment', '# maple-disable-file'],
    ['twig comment', '{# maple-disable-file #}'],
    ['razor comment', '@* maple-disable-file *@'],
  ])('disables the file from a %s', (_name, directive) => {
    const text = `${directive}\n<div class="bg-red-500"></div>`;
    expect(values(text)).toEqual([]);
  });

  it.each([
    ['html comment', '<!-- maple-disable-line -->'],
    ['block comment', '/* maple-disable-line */'],
    ['line comment', '// maple-disable-line'],
    ['twig comment', '{# maple-disable-line #}'],
    ['razor comment', '@* maple-disable-line *@'],
  ])('disables a line from a %s', (_name, directive) => {
    const text = `<div class="btn"></div> ${directive}\n<span class="flex"></span>`;
    expect(values(text)).toEqual(['flex']);
  });

  it('disables a block from html comments', () => {
    const text = `
      <div class="btn"></div>
      <!-- maple-disable -->
      <div class="bg-red-500"></div>
      <!-- maple-enable -->
      <div class="flex"></div>
    `;
    expect(values(text)).toEqual(['btn', 'flex']);
  });

  it('requires the comment form, not a bare mention', () => {
    const text = `
      <p>Use maple-disable-file to turn the extension off.</p>
      <div class="btn"></div>
    `;
    expect(values(text)).toEqual(['btn']);
  });

  it('keeps a longer directive from matching a shorter one', () => {
    // `// maple-disable-file` must not register as `maple-disable`
    const text = `
      // maple-disable-next-line
      <div class="btn"></div>
      <div class="flex"></div>
    `;
    expect(values(text)).toEqual(['flex']);
  });
});

describe('Directives printed as documentation', () => {
  const values = (text: string, languageId = 'html') =>
    LanguageServiceRegistry.getService(languageId)!
      .extractClasses(text)
      .map((c) => c.value);

  it('ignores a script-comment directive inside element text', () => {
    const text = `
      <div class="@table">
        <code class="@mark">/* maple-disable-file */</code>
        <code class="@mark">/* maple-disable */</code>
        <code class="@mark">/* maple-disable-line */</code>
        <code class="@mark">/* maple */</code>
      </div>
    `;
    expect(values(text)).toEqual([
      '@table',
      '@mark',
      '@mark',
      '@mark',
      '@mark',
    ]);
  });

  it('ignores one split across lines by a formatter', () => {
    const text = `
      <div class="@tcell">
        <code class="@mark"
          >/* maple-disable-file */</code
        >
      </div>
    `;
    expect(values(text)).toEqual(['@tcell', '@mark']);
  });

  it('ignores one inside a multi-line text node', () => {
    const text = `
      <pre class="@code">
/* maple-disable-file */
      </pre>
      <div class="btn"></div>
    `;
    expect(values(text)).toEqual(['@code', 'btn']);
  });

  it('ignores one inside an angular inline template', () => {
    const text = `
      @Component({
        selector: 'article[app-page-static]',
        template: \`
          <code class="@mark">/* maple-disable-file */</code>
          <div class="p-4"></div>
        \`,
      })
      export class PageStaticComponent {}
    `;
    expect(values(text, 'typescript')).toEqual(['@mark', 'p-4']);
  });

  it('still honors a directive that only looks adjacent to markup', () => {
    // A trailing line comment after markup is a real comment
    const text = `
      <div class="btn"></div> // maple-disable-line
      <div class="flex"></div>
    `;
    expect(values(text)).toEqual(['flex']);
  });

  it('still honors a jsx brace-wrapped comment inside markup', () => {
    const text = `
      <div className="btn">
        {/* maple-disable-next-line */}
        <span className="bg-red-500"></span>
      </div>
    `;
    expect(values(text, 'typescriptreact')).toEqual(['btn']);
  });

  it('is not confused by typescript generics before a directive', () => {
    const text = `
      const items: Array<string> = [];
      /* maple-disable-file */
      const x = '<div class="btn"></div>';
    `;
    expect(values(text, 'typescript')).toEqual([]);
  });

  it('is not confused by comparisons before a directive', () => {
    const text = `
      const ok = a < b && c > d;
      /* maple-disable */
      const el = '<div class="btn"></div>';
    `;
    expect(values(text, 'typescript')).toEqual([]);
  });
});

describe('Directives nested in another comment', () => {
  const values = (text: string, languageId = 'html') =>
    LanguageServiceRegistry.getService(languageId)!
      .extractClasses(text)
      .map((c) => c.value);

  it('ignores one quoted inside a line comment', () => {
    const text = `
      // Reach for /* maple-disable-file */ when a file is not maple
      <div class="btn"></div>
    `;
    expect(values(text)).toEqual(['btn']);
  });

  it('ignores one quoted inside a block comment', () => {
    const text = `
      /**
       * Turn a line off with // maple-disable-line at its end.
       */
      <div class="btn"></div>
    `;
    expect(values(text)).toEqual(['btn']);
  });

  it('ignores one quoted inside an html comment', () => {
    const text = `
      <!-- /* maple-disable */ documents the block form -->
      <div class="btn"></div>
    `;
    expect(values(text)).toEqual(['btn']);
  });
});

describe('Commented-out markup', () => {
  const values = (text: string, languageId = 'html') =>
    LanguageServiceRegistry.getService(languageId)!
      .extractClasses(text)
      .map((c) => c.value);

  it.each([
    ['line comment', '// <div class="btn"></div>'],
    ['html comment', '<!-- <div class="btn"></div> -->'],
    ['block comment', '/* <div class="btn"></div> */'],
    ['jsdoc continuation', ' * <div class="btn"></div>'],
  ])('still skips markup inside a %s', (_name, line) => {
    expect(values(`${line}\n<div class="flex"></div>`)).toEqual(['flex']);
  });

  it('keeps classes on a line holding a url', () => {
    const text = '<a href="https://example.com" class="c-blue">Link</a>';
    expect(values(text)).toEqual(['c-blue']);
  });

  it('keeps classes after a closed html comment', () => {
    const text = '<!-- note --> <div class="p-4">x</div>';
    expect(values(text)).toEqual(['p-4']);
  });

  it('keeps classes after a closed block comment', () => {
    const text = '/* note */ <div class="p-4">x</div>';
    expect(values(text)).toEqual(['p-4']);
  });

  it('keeps classes after an angular structural directive', () => {
    const text = `
      <div
        *ngIf="cond" class="p-4"
      >x</div>
    `;
    expect(values(text)).toEqual(['p-4']);
  });

  it('keeps classes on a line whose attribute value holds comment syntax', () => {
    const text = '<div data-note="/* not a comment" class="p-4">x</div>';
    expect(values(text)).toEqual(['p-4']);
  });
});

describe('Per-language comment forms', () => {
  const values = (languageId: string, text: string) =>
    LanguageServiceRegistry.getService(languageId)!
      .extractClasses(text)
      .map((c) => c.value);

  // [languageId, label, comment wrapper with X as the payload]
  const forms: Array<[string, string, string]> = [
    ['html', 'html', '<!-- X -->'],
    ['vue', 'html', '<!-- X -->'],
    ['vue', 'block', '/* X */'],
    ['vue', 'line', '// X'],
    ['svelte', 'html', '<!-- X -->'],
    ['svelte', 'block', '/* X */'],
    ['svelte', 'line', '// X'],
    ['javascriptreact', 'block', '/* X */'],
    ['javascriptreact', 'line', '// X'],
    ['typescriptreact', 'block', '/* X */'],
    ['typescriptreact', 'line', '// X'],
    ['javascript', 'block', '/* X */'],
    ['javascript', 'line', '// X'],
    ['typescript', 'block', '/* X */'],
    ['typescript', 'line', '// X'],
    ['razor', 'razor', '@* X *@'],
    ['razor', 'line', '// X'],
    ['aspnetcorerazor', 'razor', '@* X *@'],
    ['php', 'block', '/* X */'],
    ['php', 'line', '// X'],
    ['php', 'hash', '# X'],
    ['twig', 'twig', '{# X #}'],
    ['twig', 'html', '<!-- X -->'],
  ];

  it.each(forms)(
    '%s honors a directive in a %s comment',
    (lang, _kind, wrap) => {
      const directive = (name: string) => wrap.replace('X', name);

      expect(
        values(
          lang,
          `${directive('maple-disable-file')}\n<div class="p-4"></div>`,
        ),
      ).toEqual([]);

      expect(
        values(
          lang,
          `<div class="p-4"></div> ${directive('maple-disable-line')}\n<div class="flex"></div>`,
        ),
      ).toEqual(['flex']);

      expect(
        values(
          lang,
          [
            '<div class="btn"></div>',
            directive('maple-disable'),
            '<div class="p-4"></div>',
            directive('maple-enable'),
            '<div class="flex"></div>',
          ].join('\n'),
        ),
      ).toEqual(['btn', 'flex']);
    },
  );

  it.each(forms)('%s skips markup inside a %s comment', (lang, _kind, wrap) => {
    const text = `${wrap.replace('X', '<div class="p-4"></div>')}\n<div class="flex"></div>`;
    expect(values(lang, text)).toEqual(['flex']);
  });

  it.each(forms)(
    '%s ignores a directive quoted in a %s comment',
    (lang, _kind, wrap) => {
      const text = `${wrap.replace('X', 'use /* maple-disable-file */ here')}\n<div class="p-4"></div>`;
      expect(values(lang, text)).toEqual(['p-4']);
    },
  );

  it.each(forms)('%s keeps classes on a url line (%s)', (lang) => {
    const text = '<a href="https://example.com" class="c-blue">y</a>';
    expect(values(lang, text)).toEqual(['c-blue']);
  });
});

describe('Language-specific comment syntax stays scoped', () => {
  const values = (languageId: string, text: string) =>
    LanguageServiceRegistry.getService(languageId)!
      .extractClasses(text)
      .map((c) => c.value);

  it('does not read svelte block openers as twig comments', () => {
    expect(
      values('svelte', '{#if active}<div class="p-4">x</div>{/if}'),
    ).toEqual(['p-4']);
    expect(
      values('svelte', '{#each items as i}<span class="c-red">y</span>{/each}'),
    ).toEqual(['c-red']);
  });

  it('does not read angular template refs as php comments', () => {
    expect(values('html', '<div #ref class="p-4">x</div>')).toEqual(['p-4']);
    expect(
      values('typescript', 'template: `<input #box class="p-4" />`'),
    ).toEqual(['p-4']);
  });

  it('does not read css ids as comments', () => {
    const text = '<style>#header{color:red}</style>\n<div class="p-4">x</div>';
    expect(values('html', text)).toEqual(['p-4']);
  });

  it('reads a php hash comment but not a php attribute', () => {
    expect(
      values('php', '# <div class="p-4"></div>\n<div class="flex"></div>'),
    ).toEqual(['flex']);
    expect(values('php', '#[Route("/x")]\n<div class="p-4">x</div>')).toEqual([
      'p-4',
    ]);
  });

  it('keeps twig and razor tag syntax out of the comment scanner', () => {
    expect(
      values('twig', '{% if x %}<div class="p-4">y</div>{% endif %}'),
    ).toEqual(['p-4']);
    expect(values('razor', '@model Foo\n<div class="p-4">x</div>')).toEqual([
      'p-4',
    ]);
  });
});

describe('Directives with markup between them and the enclosing close', () => {
  const values = (text: string, languageId = 'html') =>
    LanguageServiceRegistry.getService(languageId)!
      .extractClasses(text)
      .map((c) => c.value);

  it('ignores one followed by a sibling element', () => {
    const text = [
      '<code class="@mark">/* maple-disable */ <span class="note">n</span></code>',
      '<div class="after">x</div>',
    ].join('\n');
    expect(values(text)).toEqual(['@mark', 'note', 'after']);
  });

  it('ignores one whose cell opens another element below it', () => {
    const text = [
      '<div class="@tcell">/* maple-disable */',
      '  <span class="in">y</span>',
      '</div>',
      '<div class="after">x</div>',
    ].join('\n');
    expect(values(text)).toEqual(['@tcell', 'in', 'after']);
  });

  it('ignores one separated from its close by a void element', () => {
    const text = [
      '<div class="@tcell">/* maple-disable-file */',
      '  <br>',
      '</div>',
      '<div class="after">x</div>',
    ].join('\n');
    expect(values(text)).toEqual(['@tcell', 'after']);
  });

  it('still honors one at the top level of a document', () => {
    const text = [
      '<div class="before">a</div>',
      '/* maple-disable */',
      '<div class="after">x</div>',
    ].join('\n');
    expect(values(text)).toEqual(['before']);
  });

  it('still honors one above an angular inline template', () => {
    const text = [
      '/* maple-disable-file */',
      '@Component({ template: `<div class="p-4"></div>` })',
      'export class X {}',
    ].join('\n');
    expect(values(text, 'typescript')).toEqual([]);
  });

  it('ignores one inside an inline template between elements', () => {
    const text = [
      'template: `',
      '  <div class="@row">',
      '    /* maple-disable */',
      '    <span class="in">y</span>',
      '  </div>',
      '`',
    ].join('\n');
    expect(values(text, 'typescript')).toEqual(['@row', 'in']);
  });
});

describe('Directives inside string literals', () => {
  const values = (text: string, languageId = 'typescript') =>
    LanguageServiceRegistry.getService(languageId)!
      .extractClasses(text)
      .map((c) => c.value);

  const after = `\nconst el = '<div class="after">x</div>';`;

  it.each([
    ['single quotes', `const d = '/* maple-disable */';`],
    ['double quotes', `const d = "/* maple-disable */";`],
    ['backticks', 'const d = `/* maple-disable */`;'],
    ['object value', `const rows = [{ d: '/* maple-disable */' }];`],
    ['file scope', `const d = '/* maple-disable-file */';`],
    ['line scope', `const d = '/* maple-disable-line */';`],
    ['html comment form', `const d = '<!-- maple-disable -->';`],
  ])('ignores a directive quoted in %s', (_name, line) => {
    expect(values(line + after)).toEqual(['after']);
  });

  it('ignores an opt-in comment quoted in a string', () => {
    expect(values(`const d = '/* maple */';` + after)).toEqual(['after']);
  });

  it('ignores an object opt-in quoted in a string', () => {
    expect(values(`const d = '/* maple */ { p4: true }';` + after)).toEqual([
      'after',
    ]);
  });

  it('ignores one inside an html attribute value', () => {
    const text =
      '<div title="/* maple-disable */">a</div>\n<div class="after">x</div>';
    expect(values(text, 'html')).toEqual(['after']);
  });

  it('still honors a real directive next to strings', () => {
    expect(values(`/* maple-disable */` + after)).toEqual([]);
  });

  it('still honors one inside an angular inline template', () => {
    const text = [
      'template: `',
      '  <div class="a"></div>',
      '  <!-- maple-disable -->',
      '  <div class="b"></div>',
      '`',
    ].join('\n');
    expect(values(text)).toEqual(['a']);
  });

  it('still honors a line directive after a string', () => {
    const text = [
      `const url = 'https://example.com';`,
      '<div class="p-4"></div> // maple-disable-line',
      '<div class="flex"></div>',
    ].join('\n');
    expect(values(text)).toEqual(['flex']);
  });
});
