import { describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { MapleCompletionProvider } from "../src/providers/CompletionProvider";

// Mock Config to pretend extension is enabled
vi.mock("../src/helpers/config", () => ({
  isExtensionEnabled: () => true,
}));

describe("MapleCompletionProvider", () => {
  it("should provide autocomplete items inside class attribute", () => {
    const provider = new MapleCompletionProvider();

    // We create a mock document and position
    const mockDocument = {
      getText: (range?: vscode.Range) => {
        const text = '<div class="bgc-"></div>';
        if (!range) return text;
        if (range.start.character === 0 && range.end.character === 16)
          return '<div class="bgc-';
        if (range.start.character === 12 && range.end.character === 16)
          return "bgc-";
        return text;
      },
      offsetAt: () => 16,
      getWordRangeAtPosition: () => new vscode.Range(0, 12, 0, 16),
      lineAt: () => ({ text: '<div class="bgc-"></div>' }),
      uri: { fsPath: "/test/file.html" },
    } as unknown as vscode.TextDocument;

    const position = new vscode.Position(0, 16);
    const token = {} as vscode.CancellationToken;
    const context = {} as vscode.CompletionContext;

    const result = provider.provideCompletionItems(
      mockDocument,
      position,
      token,
      context,
    ) as vscode.CompletionList;

    // Assert that we have completion items
    expect(result).toBeDefined();
    expect(result.items.length).toBeGreaterThan(0);

    // Test that background color autocomplete proposes color values like bgc-red
    const hasRed = result.items.some(
      (item: vscode.CompletionItem) =>
        item.label === "bgc-red" || item.insertText === "bgc-red",
    );
    expect(hasRed).toBe(true);
  });

  it("should not provide items outside class attribute", () => {
    const provider = new MapleCompletionProvider();

    const mockDocument = {
      getText: () => "<div>hello bgc-</div>",
      offsetAt: () => 15,
      getWordRangeAtPosition: () => new vscode.Range(0, 11, 0, 15),
      lineAt: () => ({ text: "<div>hello bgc-</div>" }),
      uri: { fsPath: "/test/file.html" },
    } as unknown as vscode.TextDocument;

    const position = new vscode.Position(0, 15);
    const result = provider.provideCompletionItems(
      mockDocument,
      position,
      {} as any,
      {} as any,
    );

    expect(result).toBeUndefined();
  });
});
