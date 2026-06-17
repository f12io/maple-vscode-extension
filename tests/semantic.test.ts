import { describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { MapleSemanticTokensProvider } from "../src/providers/SemanticTokensProvider";

// Mock Config to pretend extension is enabled
vi.mock("../src/helpers/config", () => ({
  isExtensionEnabled: () => true,
}));

describe("MapleSemanticTokensProvider", () => {
  it("should provide semantic tokens for valid maple classes", () => {
    const provider = new MapleSemanticTokensProvider();

    // We create a mock document containing a class attribute
    const mockDocument = {
      getText: () => '<div class="bgc-red-500 @md:flex"></div>',
      positionAt: (offset: number) => {
        // Very basic mock just returning a position on line 0
        return new vscode.Position(0, offset);
      },
      uri: { fsPath: "/test/file.html" },
    } as unknown as vscode.TextDocument;

    const token = {} as vscode.CancellationToken;

    const result = provider.provideDocumentSemanticTokens(
      mockDocument,
      token,
    ) as any;

    // Assert that we have semantic tokens
    expect(result).toBeDefined();
    expect(result.data).toBeDefined();

    // Check that we captured some tokens
    expect(result.data.length).toBeGreaterThan(0);

    // We expect:
    // tokenType 1 (mapleUtility) for 'bgc'
    // tokenType 6 (mapleSeparator) for '-'
    // tokenType 2 (mapleValue) for 'red-500'
    // tokenType 0 (mapleMediaQuery) for '@md'
    
    // Check if 'bgc' utility token exists
    const hasBgcToken = result.data.some((t: any) => t.tokenType === 1 && t.length === 3);
    expect(hasBgcToken).toBe(true);

    // Check if 'red-500' value token exists (this tests the color token!)
    const hasRed500Token = result.data.some((t: any) => t.tokenType === 2 && t.length === 7);
    expect(hasRed500Token).toBe(true);
  });

  it("should handle custom aliases", () => {
    const provider = new MapleSemanticTokensProvider();

    const mockDocument = {
      getText: () => '<html class="--alias-btn=bgc-red-500"></html>',
      positionAt: (offset: number) => {
        return new vscode.Position(0, offset);
      },
      uri: { fsPath: "/test/file.html" },
    } as unknown as vscode.TextDocument;

    const token = {} as vscode.CancellationToken;

    const result = provider.provideDocumentSemanticTokens(
      mockDocument,
      token,
    ) as any;

    expect(result).toBeDefined();
    expect(result.data.length).toBeGreaterThan(0);
  });
});
