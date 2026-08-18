import { beforeEach, describe, expect, it, vi } from 'vitest';

const featureState = { diagnostics: true, quickFix: true };

vi.mock('vscode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../__mocks__/vscode')>();

  return {
    ...actual,
    window: {
      createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    },
  };
});

vi.mock('../src/helpers/config', () => ({
  isExtensionEnabled: () => true,
  isFeatureEnabled: (feature: 'diagnostics' | 'quickFix') =>
    featureState[feature] ?? true,
}));

vi.mock('../src/helpers/exclude', () => ({
  isFileExcluded: () => false,
}));

vi.mock('../src/helpers/alias-cache', () => ({
  AliasCache: { getAliases: () => new Map<string, string>() },
}));

// Through the alias, so this is the very module instance the provider sees.
const vscode =
  (await import('vscode')) as unknown as typeof import('../__mocks__/vscode');
const { MapleCodeActionProvider } =
  await import('../src/providers/CodeActionProvider');
const { getMapleDiagnostics, MAPLE_DIAGNOSTIC_SOURCE } =
  await import('../src/providers/DiagnosticsProvider');

let documentCounter = 0;

/**
 * A single-line document: offsets and columns coincide, which keeps the
 * assertions about ranges readable. Each one gets its own uri by default,
 * since the provider caches per uri and version.
 */
function createDocument(
  text: string,
  path = `/workspace/test-${++documentCounter}.html`,
) {
  let version = 1;

  return {
    languageId: 'html',
    fileName: path,
    uri: { scheme: 'file', fsPath: path, toString: () => `file://${path}` },
    get version() {
      return version;
    },
    bump() {
      version++;
    },
    getText: (range?: {
      start: { character: number };
      end: { character: number };
    }) =>
      range ? text.slice(range.start.character, range.end.character) : text,
    positionAt: (offset: number) => new vscode.Position(0, offset),
    offsetAt: (position: { character: number }) => position.character,
  };
}

/** The diagnostics the extension would publish, as VS Code hands them back. */
function publishedDiagnostics(document: ReturnType<typeof createDocument>) {
  return getMapleDiagnostics(document as never).map((issue) => {
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(0, issue.start, 0, issue.end),
      issue.message,
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = MAPLE_DIAGNOSTIC_SOURCE;
    diagnostic.code = issue.code;
    return diagnostic;
  });
}

function provide(
  document: ReturnType<typeof createDocument>,
  diagnostics = publishedDiagnostics(document),
) {
  const actions = new MapleCodeActionProvider().provideCodeActions(
    document as never,
    new vscode.Range(0, 0, 0, 0),
    { diagnostics } as never,
    {} as never,
  );

  return (actions ?? []) as Array<InstanceType<typeof vscode.CodeAction>>;
}

/** The text `document` ends up with once `action` is applied. */
function applied(
  document: ReturnType<typeof createDocument>,
  action: InstanceType<typeof vscode.CodeAction>,
): string {
  const text = document.getText();

  return action.edit!.edits.reduce(
    (result, edit) =>
      result.slice(0, edit.range.start.character) +
      edit.newText +
      result.slice(edit.range.end.character),
    text,
  );
}

describe('MapleCodeActionProvider', () => {
  beforeEach(() => {
    featureState.diagnostics = true;
    featureState.quickFix = true;
  });

  it('offers the core fix for a misplaced important marker', () => {
    const document = createDocument('<div class="&:hover:!o-100"></div>');

    const [action, ...rest] = provide(document);

    expect(rest).toHaveLength(0);
    expect(action.title).toBe("Replace with '!&:hover:o-100'");
    expect(action.kind).toBe(vscode.CodeActionKind.QuickFix);
    expect(action.isPreferred).toBe(true);
    expect(applied(document, action)).toBe(
      '<div class="!&:hover:o-100"></div>',
    );
  });

  it('offers no fix where the correction would be a guess', () => {
    const document = createDocument('<div class="bgc-red-951"></div>');

    expect(provide(document)).toHaveLength(0);
  });

  it('removes the class the fix was invoked on, with its separator', () => {
    const document = createDocument('<div class="p-4 p-8 m-2"></div>');

    const actions = provide(document);

    expect(actions.map((action) => action.title)).toEqual([
      "Remove 'p-4'",
      "Remove 'p-8'",
    ]);
    expect(applied(document, actions[0])).toBe('<div class="p-8 m-2"></div>');
    expect(applied(document, actions[1])).toBe('<div class="p-4 m-2"></div>');
  });

  it('never auto-fixes a conflict, since either class could go', () => {
    const document = createDocument('<div class="p-4 p-8"></div>');

    for (const action of provide(document)) {
      expect(action.isPreferred).toBe(false);
    }
  });

  it('takes the leading separator when the class ends the attribute', () => {
    const document = createDocument('<div class="p-4 p-8"></div>');

    const [, last] = provide(document);

    expect(applied(document, last)).toBe('<div class="p-4"></div>');
  });

  it('keeps a trailing concatenation seam intact', () => {
    const document = createDocument(
      "<div class={'p-4 p-8 ' + extra}></div>",
      '/workspace/test.jsx',
    );

    const actions = provide(document);
    const removeLast = actions.find(
      (action) => action.title === "Remove 'p-8'",
    );

    expect(removeLast).toBeDefined();
    expect(applied(document, removeLast!)).toBe(
      "<div class={'p-4 ' + extra}></div>",
    );
  });

  it('ignores diagnostics from other extensions', () => {
    const document = createDocument('<div class="&:hover:!o-100"></div>');
    const foreign = new vscode.Diagnostic(
      new vscode.Range(0, 12, 0, 26),
      'Something else',
      vscode.DiagnosticSeverity.Warning,
    );
    foreign.source = 'eslint';

    expect(provide(document, [foreign])).toHaveLength(0);
  });

  it('offers nothing while quick fixes are turned off', () => {
    const document = createDocument('<div class="&:hover:!o-100"></div>');
    const diagnostics = publishedDiagnostics(document);

    featureState.quickFix = false;

    expect(provide(document, diagnostics)).toHaveLength(0);
  });

  it('fixes against the current text after an edit inside the lint debounce', () => {
    const path = '/workspace/stale.html';
    const first = createDocument('<div class="p-4!"></div>', path);
    const stale = publishedDiagnostics(first);

    // Same document, one version later, with the class pushed to the right.
    const edited = createDocument('<div  class="p-4!"></div>', path);
    edited.bump();

    const shifted = publishedDiagnostics(edited);
    expect(provide(edited, shifted)).toHaveLength(1);

    // The offsets the earlier lint reported no longer name a class.
    expect(provide(edited, stale)).toHaveLength(0);
  });
});
