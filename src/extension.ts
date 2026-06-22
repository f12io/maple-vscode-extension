import * as vscode from "vscode";
import { AliasCache } from "./helpers/alias-cache";
import { isExtensionEnabled } from "./helpers/config";
import { MapleColorProvider } from "./providers/ColorProvider";
import { MapleCompletionProvider } from "./providers/CompletionProvider";
import { subscribeToDocumentChanges } from "./providers/DiagnosticsProvider";
import { MapleHoverProvider } from "./providers/HoverProvider";
import {
  MapleSemanticTokensProvider,
  semanticTokensLegend,
} from "./providers/SemanticTokensProvider";

export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "maple-vscode-extension" is now active!',
  );
  vscode.window.showInformationMessage("Maple Extension is now Active!");

  AliasCache.init(context);

  const documentSelector: vscode.DocumentSelector = [
    "html",
    "javascriptreact",
    "typescriptreact",
    "vue",
    "svelte",
    "typescript",
    "javascript",
    "razor",
  ];

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      documentSelector,
      new MapleHoverProvider(),
    ),
  );

  const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split(
    "",
  );
  const numbers = "0123456789".split("");

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      documentSelector,
      new MapleCompletionProvider(),
      ...['"', "'", " ", "-", "|", "/", "@", ";", ...letters, ...numbers], // Trigger characters
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerColorProvider(
      documentSelector,
      new MapleColorProvider(),
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      documentSelector,
      new MapleSemanticTokensProvider(),
      semanticTokensLegend,
    ),
  );

  const mapleDiagnostics = vscode.languages.createDiagnosticCollection("maple");
  context.subscriptions.push(mapleDiagnostics);
  subscribeToDocumentChanges(context, mapleDiagnostics);
  context.subscriptions.push(
    AliasCache.onDidUpdateAliases.event(() => {
      if (!isExtensionEnabled()) return;
      for (const editor of vscode.window.visibleTextEditors) {
        import("./providers/DiagnosticsProvider").then(
          ({ refreshDiagnostics }) => {
            refreshDiagnostics(editor.document, mapleDiagnostics);
          },
        );
      }
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("maple.enabled")) {
        if (!isExtensionEnabled()) {
          mapleDiagnostics.clear();
        } else {
          // Refresh diagnostics for all visible editors
          for (const editor of vscode.window.visibleTextEditors) {
            import("./providers/DiagnosticsProvider").then(
              ({ refreshDiagnostics }) => {
                refreshDiagnostics(editor.document, mapleDiagnostics);
              },
            );
          }
        }
      }
    }),
  );
}

export function deactivate() {}
