import { describe, expect, it } from 'vitest';
import { getDiagnostics, type MapleDiagnostic } from '../src/index';

const html = (text: string) => getDiagnostics(text, { languageId: 'html' });

/** The document text each diagnostic covers, for offset assertions. */
const spans = (text: string, diagnostics: Array<MapleDiagnostic>) =>
  diagnostics.map((d) => text.substring(d.start, d.end));

describe('getDiagnostics', () => {
  it('returns nothing for a language core does not handle', () => {
    expect(
      getDiagnostics('<div class="zzz-9">', { languageId: 'rust' }),
    ).toEqual([]);
  });

  it('only looks inside maple regions', () => {
    // The same word outside a class attribute is prose, not a class.
    expect(html('<p>bgc-red-9999 is a typo</p>')).toEqual([]);
  });

  it('reports a per-class issue with its span and code', () => {
    const text = '<div class="p-4 bgc-red-9999">';
    const diagnostics = html(text);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('invalid-shade');
    expect(spans(text, diagnostics)).toEqual(['bgc-red-9999']);
  });

  it('carries the quick fix through from validation', () => {
    expect(html('<div class="p-4!">')[0]).toMatchObject({
      code: 'important-not-leading',
      fix: '!p-4',
    });
  });

  it('reports an alias definition outside the html element', () => {
    expect(html('<div class="--alias-btn=p-4">')[0]?.code).toBe(
      'alias-definition-scope',
    );
    expect(html('<html class="--alias-btn=p-4">')).toEqual([]);
  });

  it('resolves aliases defined in the document itself', () => {
    // No host alias source: the definition in the document is all there is.
    expect(html('<html class="--alias-btn=p-4"><div class="@btn">')).toEqual(
      [],
    );
    expect(html('<div class="@btn">')[0]?.code).toBe('unknown-class');
  });

  it('prefers a host alias source over the document', () => {
    const diagnostics = getDiagnostics('<div class="@card">', {
      languageId: 'html',
      localAliases: new Map([['card', 'p-4']]),
    });

    expect(diagnostics).toEqual([]);
  });

  it('reports a shade in a variable definition, which is raw CSS', () => {
    const text = '<html class="--brand=blue-300 p-4">';
    const diagnostics = html(text);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('shade-in-variable');
    expect(spans(text, diagnostics)).toEqual(['--brand=blue-300']);
  });

  it('leaves a variable out of conflict detection', () => {
    // Two definitions of one variable are a cascade, not a clash.
    expect(html('<html class="--brand=blue --brand=red">')).toEqual([]);
  });

  describe('conflicts', () => {
    it('reports every participant, each linking the others', () => {
      const text = '<div class="p-4 m-2 p-8">';
      const diagnostics = html(text);

      expect(diagnostics.map((d) => d.code)).toEqual([
        'conflicting-utility',
        'conflicting-utility',
      ]);
      expect(spans(text, diagnostics)).toEqual(['p-4', 'p-8']);
      expect(diagnostics[0].message).toContain('padding:');
      expect(diagnostics[0].fix).toBeUndefined();

      // Each points at the other, and at nothing else.
      expect(diagnostics[0].related).toEqual([
        { start: diagnostics[1].start, end: diagnostics[1].end },
      ]);
      expect(diagnostics[1].related).toEqual([
        { start: diagnostics[0].start, end: diagnostics[0].end },
      ]);
    });

    it('links all three occurrences when a key repeats', () => {
      const diagnostics = html('<div class="p-1 p-2 p-3">');

      expect(diagnostics).toHaveLength(3);
      for (const diagnostic of diagnostics) {
        expect(diagnostic.related).toHaveLength(2);
      }
    });

    it('does not report classes that resolve to different declarations', () => {
      expect(html('<div class="p-4 m-4 md:p-8 &:hover:p-2">')).toEqual([]);
    });

    it('keeps an alias body out of the element scope', () => {
      // `p-4` inside the body must not clash with the element's own `p-8`.
      expect(html('<html class="--alias-card=p-4;m-2 p-8">')).toEqual([]);
    });

    it('reports a conflict between the utilities of an alias body', () => {
      const text = '<html class="--alias-card=m-1;p-4;p-8">';
      const diagnostics = html(text);

      expect(diagnostics.map((d) => d.code)).toEqual([
        'conflicting-utility',
        'conflicting-utility',
      ]);
      expect(spans(text, diagnostics)).toEqual(['p-4', 'p-8']);
    });

    it('includes the utility glued to the declaration', () => {
      // The class regex leaves `p-4` attached to `--alias-card=`; it is still
      // a member of the body and clashes with `p-8`.
      const text = '<html class="--alias-card=p-4;p-8">';
      const diagnostics = html(text);

      expect(diagnostics.map((d) => d.code)).toEqual([
        'conflicting-utility',
        'conflicting-utility',
      ]);
      // The declaration itself is not part of the reported span.
      expect(spans(text, diagnostics)).toEqual(['p-4', 'p-8']);
    });

    it('does not clash an alias body with the element around it', () => {
      // The body's `p-4` applies wherever `@card` is used, not here.
      expect(html('<html class="--alias-card=p-4 p-8">')).toEqual([]);
    });

    it('separates the scopes of two alias bodies', () => {
      expect(html('<html class="--alias-a=p-4 --alias-b=p-8">')).toEqual([]);
    });
  });

  describe('host syntax', () => {
    it('exempts razor expressions from the unknown-class fallback', () => {
      const text = '<div class="@Model.Cls p-4">';

      expect(getDiagnostics(text, { languageId: 'razor' })).toEqual([]);
      expect(getDiagnostics(text, { languageId: 'html' })[0]?.code).toBe(
        'unknown-class',
      );
    });

    it('still reports a real mistake in razor', () => {
      expect(
        getDiagnostics('<div class="p-4!">', { languageId: 'razor' })[0],
      ).toMatchObject({ code: 'important-not-leading' });
    });

    it('ignores a class truncated by an interpolation', () => {
      expect(
        getDiagnostics('<div className={`p-${size} m-2`}>', {
          languageId: 'javascriptreact',
        }),
      ).toEqual([]);
    });
  });

  it('returns diagnostics in document order', () => {
    const text = '<div class="p-4 bgc-red-9999 p-8">';
    const diagnostics = html(text);

    expect(spans(text, diagnostics)).toEqual(['p-4', 'bgc-red-9999', 'p-8']);
  });
});
