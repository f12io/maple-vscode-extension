import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Ranges handed to setDecorations, keyed by decoration type. */
type DecorationLog = Map<unknown, Array<unknown>>;

interface FakeEditor {
  document: unknown;
  log: DecorationLog;
  setDecorations: (type: unknown, ranges: Array<unknown>) => void;
}

const windowState = {
  visibleTextEditors: [] as Array<FakeEditor>,
  visibleEditorsHandlers: [] as Array<(editors: Array<FakeEditor>) => void>,
};

const workspaceState = {
  documentChangeHandlers: [] as Array<(event: { document: unknown }) => void>,
};

vi.mock('vscode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../__mocks__/vscode')>();

  return {
    ...actual,
    ThemeColor: class {
      constructor(public readonly id: string) {}
    },
    window: {
      get visibleTextEditors() {
        return windowState.visibleTextEditors;
      },
      createTextEditorDecorationType: (options: unknown) => ({
        options,
        dispose() {},
      }),
      createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
      onDidChangeVisibleTextEditors: (
        handler: (editors: Array<FakeEditor>) => void,
      ) => {
        windowState.visibleEditorsHandlers.push(handler);
        return { dispose() {} };
      },
    },
    workspace: {
      ...actual.workspace,
      onDidChangeTextDocument: (
        handler: (event: { document: unknown }) => void,
      ) => {
        workspaceState.documentChangeHandlers.push(handler);
        return { dispose() {} };
      },
    },
  };
});

const colorOverrides = new Map<string, string>();

vi.mock('../src/helpers/config', () => ({
  isExtensionEnabled: () => true,
  isFeatureEnabled: () => true,
  getHighlightingMode: () => 'on',
  getColorOverride: (tokenType: string) => colorOverrides.get(tokenType) ?? '',
}));

vi.mock('../src/helpers/exclude', () => ({
  isFileExcluded: () => false,
}));

vi.mock('../src/helpers/alias-cache', () => ({
  AliasCache: { getAliases: () => new Map<string, string>() },
}));

const { DecorationsManager } =
  await import('../src/providers/DecorationsManager');
const { MAPLE_TOKEN_THEME_COLORS, MAPLE_TOKEN_TYPES } =
  await import('@f12io/maple-language-core');
const { getTokenTypeIndex } =
  await import('../src/providers/SemanticTokensProvider');

const TEXT = '<div class="d-flex p-4 bgc-red-500 hover:c-white"></div>';

function createDocument(languageId = 'html') {
  return {
    languageId,
    fileName: '/workspace/test.html',
    uri: { scheme: 'file', fsPath: '/workspace/test.html' },
    getText: () => TEXT,
    positionAt: (offset: number) => ({ line: 0, character: offset }),
  };
}

function createEditor(document: unknown): FakeEditor {
  const log: DecorationLog = new Map();
  return {
    document,
    log,
    setDecorations(type, ranges) {
      log.set(type, ranges);
    },
  };
}

/** Total number of decorated ranges an editor received. */
function rangeCount(editor: FakeEditor): number {
  let total = 0;
  for (const ranges of editor.log.values()) total += ranges.length;
  return total;
}

function createManager() {
  const context = { subscriptions: [] as Array<unknown> };
  return new DecorationsManager(context as never, [
    'html',
    'javascriptreact',
    'typescriptreact',
  ]);
}

describe('DecorationsManager editor tracking', () => {
  beforeEach(() => {
    windowState.visibleTextEditors = [];
    windowState.visibleEditorsHandlers = [];
    workspaceState.documentChangeHandlers = [];
    vi.useRealTimers();
  });

  it('decorates every editor visible at construction, not just the first', () => {
    const document = createDocument();
    const left = createEditor(document);
    const right = createEditor(document);
    windowState.visibleTextEditors = [left, right];

    createManager();

    expect(rangeCount(left)).toBeGreaterThan(0);
    expect(rangeCount(right)).toBeGreaterThan(0);
  });

  it('decorates both panes of a diff opened after activation', () => {
    const active = createEditor(createDocument());
    windowState.visibleTextEditors = [active];

    createManager();

    // Opening a diff makes two more editors visible; neither replaces the
    // active editor as far as this manager is concerned.
    const modified = createEditor(createDocument());
    const original = createEditor(createDocument());
    windowState.visibleTextEditors = [active, modified, original];

    for (const handler of windowState.visibleEditorsHandlers) {
      handler(windowState.visibleTextEditors);
    }

    expect(rangeCount(modified)).toBeGreaterThan(0);
    expect(rangeCount(original)).toBeGreaterThan(0);
  });

  it('repaints every visible editor showing an edited document', () => {
    vi.useFakeTimers();

    const document = createDocument();
    const left = createEditor(document);
    const right = createEditor(document);
    const unrelated = createEditor(createDocument());
    windowState.visibleTextEditors = [left, right, unrelated];

    createManager();

    left.log.clear();
    right.log.clear();
    unrelated.log.clear();

    for (const handler of workspaceState.documentChangeHandlers) {
      handler({ document });
    }
    vi.runAllTimers();

    expect(rangeCount(left)).toBeGreaterThan(0);
    expect(rangeCount(right)).toBeGreaterThan(0);
    expect(unrelated.log.size).toBe(0);
  });

  it('skips editors closed while the throttle timer was pending', () => {
    vi.useFakeTimers();

    const document = createDocument();
    const closing = createEditor(document);
    windowState.visibleTextEditors = [closing];

    createManager();
    closing.log.clear();

    for (const handler of workspaceState.documentChangeHandlers) {
      handler({ document });
    }
    windowState.visibleTextEditors = [];
    vi.runAllTimers();

    expect(closing.log.size).toBe(0);
  });
});

/** The color option every decoration type was created with, in legend order. */
function paintedColors(manager: {
  decorationTypes: Map<number, { options: { color: unknown } }>;
}): Map<number, unknown> {
  const colors = new Map<number, unknown>();
  for (const [index, type] of manager.decorationTypes) {
    colors.set(index, type.options.color);
  }
  return colors;
}

describe('DecorationsManager palette', () => {
  beforeEach(() => {
    windowState.visibleTextEditors = [];
    windowState.visibleEditorsHandlers = [];
    workspaceState.documentChangeHandlers = [];
    colorOverrides.clear();
    vi.useRealTimers();
  });

  it("paints core's palette, one decoration per token type", () => {
    const colors = paintedColors(createManager() as never);

    expect(colors.size).toBe(MAPLE_TOKEN_TYPES.length);
    for (const type of MAPLE_TOKEN_TYPES) {
      expect(colors.get(getTokenTypeIndex(type))).toEqual({
        id: MAPLE_TOKEN_THEME_COLORS[type],
      });
    }
  });

  it('applies a maple.colors override over the default', () => {
    colorOverrides.set('utility', '#FF0000');
    colorOverrides.set('alias', 'editorWarning.foreground');

    const colors = paintedColors(createManager() as never);

    // A hex override paints literally; anything else is a theme color id.
    expect(colors.get(getTokenTypeIndex('utility'))).toBe('#FF0000');
    expect(colors.get(getTokenTypeIndex('alias'))).toEqual({
      id: 'editorWarning.foreground',
    });
    expect(colors.get(getTokenTypeIndex('value'))).toEqual({
      id: MAPLE_TOKEN_THEME_COLORS.value,
    });
  });

  it('repaints with the new palette when overrides change', () => {
    const editor = createEditor(createDocument());
    windowState.visibleTextEditors = [editor];

    const manager = createManager();
    colorOverrides.set('utility', '#00FF00');
    editor.log.clear();
    manager.reloadColors();

    expect(
      paintedColors(manager as never).get(getTokenTypeIndex('utility')),
    ).toBe('#00FF00');
    expect(rangeCount(editor)).toBeGreaterThan(0);
  });
});
