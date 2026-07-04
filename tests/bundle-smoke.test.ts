/**
 * Bundle smoke test.
 *
 * The regular test suite imports the TypeScript sources directly, so it can
 * never catch bugs that only exist in the esbuild output (e.g. CJS/ESM
 * interop differences like `import * as picomatch` producing a non-callable
 * namespace object in the bundle). This test builds dist/extension.js, loads
 * it with a stubbed `vscode` module, activates it against a real fixture
 * document, and asserts that the highlighting/diagnostics/hover pipelines
 * produce output without logging any swallowed errors.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const Module = require('node:module');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'extension.js');
const FIXTURE = path.join(ROOT, 'tests', 'test-razor.cshtml');

class Position {
  constructor(
    public line: number,
    public character: number,
  ) {}
}
class Range {
  start: Position;
  end: Position;
  constructor(a: any, b: any, c?: any, d?: any) {
    if (typeof a === 'object') {
      this.start = a;
      this.end = b;
    } else {
      this.start = new Position(a, b);
      this.end = new Position(c, d);
    }
  }
}
class ThemeColor {
  constructor(public id: string) {}
}
class SemanticTokens {
  constructor(public data: Uint32Array) {}
}
class SemanticTokensLegend {
  constructor(
    public tokenTypes: Array<string>,
    public tokenModifiers: Array<string>,
  ) {}
}
class SemanticTokensBuilder {
  private data: Array<number> = [];
  private prevLine = 0;
  private prevChar = 0;
  constructor(public legend?: SemanticTokensLegend) {}
  push(
    line: number,
    char: number,
    length: number,
    tokenType: number,
    tokenModifiers: number,
  ) {
    const deltaLine = line - this.prevLine;
    const deltaChar = deltaLine === 0 ? char - this.prevChar : char;
    this.data.push(deltaLine, deltaChar, length, tokenType, tokenModifiers);
    this.prevLine = line;
    this.prevChar = char;
  }
  build() {
    return new SemanticTokens(Uint32Array.from(this.data));
  }
}
class EventEmitter {
  private listeners: Array<(data?: unknown) => void> = [];
  event = (fn: (data?: unknown) => void) => {
    this.listeners.push(fn);
    return { dispose() {} };
  };
  fire(data?: unknown) {
    this.listeners.forEach((l) => l(data));
  }
  dispose() {}
}
class Disposable {
  constructor(private fn?: () => void) {}
  dispose() {
    this.fn?.();
  }
}
class CancellationTokenSource {
  token = { isCancellationRequested: false, onCancellationRequested() {} };
  dispose() {}
}
class Diagnostic {
  source?: string;
  constructor(
    public range: Range,
    public message: string,
    public severity: number,
  ) {}
}
class Hover {
  constructor(public contents: unknown) {}
}
class MarkdownString {
  constructor(public value = '') {}
  appendMarkdown() {}
  appendCodeblock() {}
}

const config: Record<string, unknown> = {
  'maple.enabled': true,
  'maple.exclude': ['**/node_modules/**', '**/.git/**'],
  'maple.features.highlighting': 'on',
  'maple.features.diagnostics': true,
  'maple.features.autoComplete': true,
  'maple.features.colorPicker': true,
  'maple.features.hoverHelp': true,
};

function getConfiguration(section?: string) {
  return {
    get(key: string, def?: unknown) {
      const full = section ? `${section}.${key}` : key;
      return full in config ? config[full] : def;
    },
    inspect(key: string) {
      const full = section ? `${section}.${key}` : key;
      return full in config
        ? { key: full, workspaceValue: config[full] }
        : { key: full };
    },
  };
}

const text = readFileSync(FIXTURE, 'utf8');
const lineStarts = [0];
for (let i = 0; i < text.length; i++) {
  if (text[i] === '\n') lineStarts.push(i + 1);
}
const document = {
  languageId: 'razor',
  fileName: FIXTURE,
  uri: {
    scheme: 'file',
    fsPath: FIXTURE,
    toString: () => 'file://' + FIXTURE,
  },
  getText: () => text,
  positionAt(offset: number) {
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= offset) {
      line++;
    }
    return new Position(line, offset - lineStarts[line]);
  },
  offsetAt(pos: Position) {
    return lineStarts[pos.line] + pos.character;
  },
};

const decorationsLog = new Map<number, Array<Range>>();
let decorationTypeCounter = 0;
const outputLog: Array<string> = [];
const diagnosticsStore = new Map<string, Array<Diagnostic>>();

const editor = {
  document,
  setDecorations(decorationType: { __key: number }, ranges: Array<Range>) {
    decorationsLog.set(decorationType.__key, ranges);
  },
};

const registeredProviders: Record<string, unknown> = {};

const vscodeStub: Record<string, unknown> = {
  Position,
  Range,
  ThemeColor,
  SemanticTokens,
  SemanticTokensLegend,
  SemanticTokensBuilder,
  EventEmitter,
  Disposable,
  CancellationTokenSource,
  Diagnostic,
  Hover,
  MarkdownString,
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Uri: { file: (p: string) => ({ scheme: 'file', fsPath: p }) },
  window: {
    activeTextEditor: editor,
    visibleTextEditors: [editor],
    createOutputChannel: () => ({
      appendLine: (l: string) => outputLog.push(l),
      dispose() {},
    }),
    createTextEditorDecorationType: () => ({
      __key: decorationTypeCounter++,
      dispose() {},
    }),
    onDidChangeActiveTextEditor: () => ({ dispose() {} }),
    showInformationMessage() {},
    showWarningMessage() {},
  },
  workspace: {
    getConfiguration,
    getWorkspaceFolder: () => ({
      uri: { toString: () => 'file://' + path.dirname(FIXTURE) },
    }),
    asRelativePath: (uri: { fsPath?: string }) =>
      path.basename(uri.fsPath ?? ''),
    workspaceFolders: [
      { uri: { toString: () => 'file://' + path.dirname(FIXTURE) } },
    ],
    findFiles: () => Promise.resolve([]),
    createFileSystemWatcher: () => ({
      onDidChange() {},
      onDidCreate() {},
      onDidDelete() {},
      dispose() {},
    }),
    onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
    onDidChangeConfiguration: () => ({ dispose() {} }),
    onDidChangeTextDocument: () => ({ dispose() {} }),
    onDidCloseTextDocument: () => ({ dispose() {} }),
    onWillSaveTextDocument: () => ({ dispose() {} }),
  },
  languages: {
    registerHoverProvider: (_sel: unknown, provider: unknown) => {
      registeredProviders.hover = provider;
      return { dispose() {} };
    },
    registerCompletionItemProvider: (_sel: unknown, provider: unknown) => {
      registeredProviders.completion = provider;
      return { dispose() {} };
    },
    registerColorProvider: (_sel: unknown, provider: unknown) => {
      registeredProviders.color = provider;
      return { dispose() {} };
    },
    createDiagnosticCollection: () => ({
      set: (uri: unknown, diags: Array<Diagnostic>) =>
        diagnosticsStore.set(String(uri), diags),
      delete: (uri: unknown) => diagnosticsStore.delete(String(uri)),
      dispose() {},
    }),
  },
  commands: {
    registerTextEditorCommand: () => ({ dispose() {} }),
  },
};

let extension: {
  activate: (ctx: { subscriptions: Array<unknown> }) => void;
};
const context = { subscriptions: [] as Array<unknown> };
let origResolveFilename: unknown;

describe('bundle smoke test', () => {
  beforeAll(() => {
    execSync('node esbuild.mjs', { cwd: ROOT, stdio: 'pipe' });

    // Route require('vscode') inside the bundle to the stub
    origResolveFilename = Module._resolveFilename;
    Module._resolveFilename = function (
      this: unknown,
      request: string,
      ...args: Array<unknown>
    ) {
      if (request === 'vscode') return 'vscode';
      return (origResolveFilename as Function).call(this, request, ...args);
    };
    require.cache.vscode = {
      id: 'vscode',
      filename: 'vscode',
      loaded: true,
      exports: vscodeStub,
    } as never;

    extension = require(BUNDLE);
  }, 30000);

  afterAll(() => {
    Module._resolveFilename = origResolveFilename;
    Reflect.deleteProperty(require.cache, 'vscode');
    Reflect.deleteProperty(require.cache, BUNDLE);
  });

  it('activates without throwing', () => {
    extension.activate(context);
    expect(context.subscriptions.length).toBeGreaterThan(0);
  });

  it('renders decorations for the razor fixture', () => {
    // DecorationsManager decorates the active editor during activation
    const totalRanges = [...decorationsLog.values()].reduce(
      (sum, ranges) => sum + ranges.length,
      0,
    );
    expect(decorationTypeCounter).toBeGreaterThan(0);
    expect(totalRanges).toBeGreaterThan(0);
  });

  it('runs the diagnostics pipeline for the fixture', () => {
    expect(diagnosticsStore.has('file://' + FIXTURE)).toBe(true);
  });

  it('produces hover content through bundled prettier', async () => {
    const hoverProvider = registeredProviders.hover as {
      provideHover: (
        doc: unknown,
        pos: Position,
        token: unknown,
      ) => Promise<unknown>;
    };
    const offset = text.indexOf('c-white') + 2;
    const hover = await hoverProvider.provideHover(
      document,
      document.positionAt(offset),
      new CancellationTokenSource().token,
    );
    expect(hover).not.toBeNull();
  });

  it('logs no swallowed provider errors to the output channel', () => {
    // safeRun reports caught errors here; anything logged means a pipeline
    // silently failed inside the bundle
    expect(outputLog).toEqual([]);
  });
});
