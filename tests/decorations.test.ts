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

vi.mock('../src/helpers/config', () => ({
  isExtensionEnabled: () => true,
  isFeatureEnabled: () => true,
  getHighlightingMode: () => 'on',
}));

vi.mock('../src/helpers/exclude', () => ({
  isFileExcluded: () => false,
}));

vi.mock('../src/helpers/alias-cache', () => ({
  AliasCache: { getAliases: () => new Map<string, string>() },
}));

const { DecorationsManager } =
  await import('../src/providers/DecorationsManager');

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
