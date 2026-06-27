import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { MapleColorProvider } from '../src/providers/ColorProvider';
import { refreshDiagnostics } from '../src/providers/DiagnosticsProvider';
import {
  MapleSemanticTokensProvider,
  tokenTypes,
} from '../src/providers/SemanticTokensProvider';
import { LanguageServiceRegistry } from '../src/services/LanguageServiceRegistry';

vi.mock('../src/helpers/config', () => ({
  isExtensionEnabled: () => true,
  isFeatureEnabled: () => true,
  getHighlightingMode: () => 'on',
}));

vi.mock('../src/helpers/exclude', () => ({
  isFileExcluded: () => false,
}));

vi.mock('../src/helpers/alias-cache', () => {
  const dummyMap = new Map<string, string>();
  dummyMap.set('btn', 'bgc-red-500;p-2');
  dummyMap.set('card', 'p-{value,4}');
  dummyMap.set('l-shift', '-0.7');
  return {
    AliasCache: {
      getAliases: () => dummyMap,
    },
  };
});

describe('Workspace Highlights and Colors', () => {
  const testFiles = [
    'test-workspace.html',
    'test-react.jsx',
    'test-vue.vue',
    'test-svelte.svelte',
    'test-razor.razor',
    'test-angular.html',
    'test-angular.ts',
    'test-class.js',
    'test-php.php',
    'test-twig.twig',
  ];

  for (const fileName of testFiles) {
    it(`should generate consistent semantic tokens and colors for ${fileName}`, () => {
      const htmlContent = readFileSync(join(__dirname, fileName), 'utf8');

      const lines = htmlContent.split('\n');

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

      let langId = 'html';
      if (fileName.endsWith('.jsx')) langId = 'javascriptreact';
      else if (fileName.endsWith('.vue')) langId = 'vue';
      else if (fileName.endsWith('.svelte')) langId = 'svelte';
      else if (fileName.endsWith('.razor')) langId = 'razor';
      else if (fileName.endsWith('.ts')) langId = 'typescript';
      else if (fileName.endsWith('.js')) langId = 'javascript';
      else if (fileName.endsWith('.php')) langId = 'php';
      else if (fileName.endsWith('.twig')) langId = 'twig';

      const mockDocument = {
        getText: () => htmlContent,
        positionAt,
        uri: { fsPath: `/test/${fileName}` },
        languageId: langId,
      } as unknown as vscode.TextDocument;

      // Mock vscode API needed for diagnostics
      (vscode as any).DiagnosticSeverity = {
        Error: 0,
        Warning: 1,
        Information: 2,
        Hint: 3,
      };
      (vscode as any).Diagnostic = class Diagnostic {
        range: any;
        message: string;
        severity: number;
        source?: string;
        constructor(range: any, message: string, severity: number) {
          this.range = range;
          this.message = message;
          this.severity = severity;
        }
      };

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
      ) as Array<any>;

      const diagnosticsMap = new Map<vscode.Uri, Array<vscode.Diagnostic>>();
      const mockDiagnosticsCollection = {
        name: 'maple',
        set: (uri: vscode.Uri, diags: Array<vscode.Diagnostic>) => {
          diagnosticsMap.set(uri, diags);
        },
        delete: (uri: vscode.Uri) => {
          diagnosticsMap.delete(uri);
        },
        clear: () => {
          diagnosticsMap.clear();
        },
        forEach: () => {},
        get: (uri: vscode.Uri) => diagnosticsMap.get(uri),
        has: (uri: vscode.Uri) => diagnosticsMap.has(uri),
        dispose: () => {},
      } as unknown as vscode.DiagnosticCollection;

      refreshDiagnostics(mockDocument, mockDiagnosticsCollection);
      const diagnosticsResult = diagnosticsMap.get(mockDocument.uri) || [];

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

      const mappedDiagnostics = diagnosticsResult.map((d: any) => {
        return {
          line: d.range.start.line,
          char: d.range.start.character,
          message: d.message,
        };
      });

      const classInstances =
        LanguageServiceRegistry.getService(langId)?.extractClasses(
          htmlContent,
        ) || [];

      const snapshotData: Array<any> = [];

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

        const diagnosticsForClass = mappedDiagnostics.filter((d: any) => {
          const diagStartOffset = getOffset(d.line, d.char);
          return (
            diagStartOffset >= instanceStartOffset &&
            diagStartOffset < instanceEndOffset
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
          warnings: diagnosticsForClass.map((d: any) => d.message),
        });
      }

      expect(snapshotData).toMatchSnapshot();
    });
  }
});
