import { describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { MapleHoverProvider } from '../src/providers/HoverProvider';

vi.mock('../src/helpers/config', () => ({
  isExtensionEnabled: () => true,
  isFeatureEnabled: () => true,
  getHighlightingMode: () => 'on',
}));

vi.mock('../src/helpers/exclude', () => ({
  isFileExcluded: () => false,
}));

vi.mock('../src/helpers/alias-cache', () => ({
  AliasCache: {
    getAliases: () => new Map<string, string>(),
  },
}));

function makeDocument(languageId: string, text: string) {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') lineStarts.push(i + 1);
  }
  return {
    languageId,
    fileName: `test.${languageId}`,
    uri: { scheme: 'untitled', fsPath: '', toString: () => 'untitled:test' },
    getText: () => text,
    offsetAt: (pos: { line: number; character: number }) =>
      lineStarts[pos.line] + pos.character,
    positionAt: (offset: number) => {
      let line = 0;
      while (line + 1 < lineStarts.length && lineStarts[line + 1] <= offset) {
        line++;
      }
      return { line, character: offset - lineStarts[line] };
    },
  } as unknown as vscode.TextDocument;
}

const cancellation = {
  isCancellationRequested: false,
} as vscode.CancellationToken;

async function hoverAt(languageId: string, text: string, target: string) {
  const doc = makeDocument(languageId, text);
  // Hover in the middle of the target word
  const offset = text.indexOf(target) + Math.floor(target.length / 2);
  const provider = new MapleHoverProvider();
  const hover = await provider.provideHover(
    doc,
    doc.positionAt(offset),
    cancellation,
  );
  const contents = hover?.contents as { value: string } | undefined;
  return contents?.value;
}

describe('MapleHoverProvider', () => {
  it('shows CSS for a simple class', async () => {
    const markdown = await hoverAt('html', '<div class="p-2">', 'p-2');
    expect(markdown).toContain('padding');
  });

  it('resolves the Razor @@ escape to the rendered class', async () => {
    const markdown = await hoverAt(
      'razor',
      '<div class="bgc-green-500 @@md:p-2">',
      '@@md:p-2',
    );

    // Razor renders @@ as a single @, so the CSS must be for @md:p-2
    expect(markdown).toContain('min-width: 768px');
    expect(markdown).toContain('@md');
    expect(markdown).not.toContain('@@md');
    expect(markdown).not.toContain('@media @md');
  });

  it('resolves C# tab escapes as separators between classes', async () => {
    const text = '<div class="@(x ? $"fs-50\\tm-2 p-1" : "c-red")">';

    const fsHover = await hoverAt('razor', text, 'fs-50');
    expect(fsHover).toContain('font-size');
    expect(fsHover).not.toContain('\\t');

    const mHover = await hoverAt('razor', text, 'm-2');
    expect(mHover).toContain('margin');
  });

  it('does not leak newlines from multi-line class attributes', async () => {
    const markdown = await hoverAt(
      'razor',
      '<div class="\n  bgc-green-500 @@md:p-2\n  ">',
      '@@md:p-2',
    );

    // A word carrying a trailing \n gets CSS-escaped as \a by the engine
    expect(markdown).toBeDefined();
    expect(markdown).not.toContain('\\a');
    expect(markdown).toContain('min-width: 768px');
  });
});
