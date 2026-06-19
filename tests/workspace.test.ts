import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { extractAllClasses } from "../src/helpers/class-extractor";
import { MapleColorProvider } from "../src/providers/ColorProvider";
import {
  MapleSemanticTokensProvider,
  tokenTypes,
} from "../src/providers/SemanticTokensProvider";

vi.mock("../src/helpers/config", () => ({
  isExtensionEnabled: () => true,
}));

describe("Workspace Highlights and Colors", () => {
  it("should generate consistent semantic tokens and colors for test-workspace.html", () => {
    const htmlContent = readFileSync(
      join(__dirname, "test-workspace.html"),
      "utf8",
    );

    const lines = htmlContent.split("\n");

    const getOffset = (line: number, char: number) => {
      let offset = 0;
      for (let i = 0; i < line; i++) {
        offset += lines[i].length + 1;
      }
      return offset + char;
    };

    const positionAt = (offset: number) => {
      let currentOffset = 0;
      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length + 1; // +1 for newline
        if (offset < currentOffset + lineLength) {
          return new vscode.Position(i, offset - currentOffset);
        }
        currentOffset += lineLength;
      }
      return new vscode.Position(
        lines.length - 1,
        lines[lines.length - 1].length,
      );
    };

    const mockDocument = {
      getText: () => htmlContent,
      positionAt,
      uri: { fsPath: "/test/test-workspace.html" },
    } as unknown as vscode.TextDocument;

    const token = {} as vscode.CancellationToken;

    const semanticProvider = new MapleSemanticTokensProvider();
    const semanticResult = semanticProvider.provideDocumentSemanticTokens(
      mockDocument,
      token,
    ) as any;

    const colorProvider = new MapleColorProvider();
    const colorsResult = colorProvider.provideDocumentColors(
      mockDocument,
      token,
    ) as any[];

    const mappedTokens = semanticResult.data.map((t: any) => {
      const lineStr = lines[t.line];
      const text = lineStr.substring(t.char, t.char + t.length);
      const type = tokenTypes[t.tokenType];
      return {
        line: t.line,
        char: t.char,
        text,
        type,
      };
    });

    const mappedColors = colorsResult.map((c: any) => {
      const lineStr = lines[c.range.start.line];
      const text = lineStr.substring(
        c.range.start.character,
        c.range.end.character,
      );
      return {
        line: c.range.start.line,
        char: c.range.start.character,
        text,
        color: `rgba(${Math.round(c.color.red * 255)}, ${Math.round(
          c.color.green * 255,
        )}, ${Math.round(c.color.blue * 255)}, ${c.color.alpha})`,
      };
    });

    const classInstances = extractAllClasses(htmlContent);

    const snapshotData: any[] = [];

    for (const instance of classInstances) {
      const instanceStartOffset = instance.start;
      const instanceEndOffset = instance.start + instance.value.length;

      const tokensForClass = mappedTokens.filter((t: any) => {
        const tokenStartOffset = getOffset(t.line, t.char);
        return (
          tokenStartOffset >= instanceStartOffset &&
          tokenStartOffset < instanceEndOffset
        );
      });

      const colorsForClass = mappedColors.filter((c: any) => {
        const colorStartOffset = getOffset(c.line, c.char);
        return (
          colorStartOffset >= instanceStartOffset &&
          colorStartOffset < instanceEndOffset
        );
      });

      snapshotData.push({
        classValue: instance.value,
        tokens: tokensForClass.map((t: any) => ({
          text: t.text,
          type: t.type,
        })),
        colors: colorsForClass.map((c: any) => ({
          text: c.text,
          color: c.color,
        })),
      });
    }

    expect(snapshotData).toMatchSnapshot();
  });
});
