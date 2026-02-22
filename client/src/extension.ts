import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";
import { DOCUMENT_SELECTOR } from "./constants";
import {
  completionItemProvider,
  completionItemResolver,
} from "./completion-item-provider-and-resolver";
import { TRIGGER_CHARS } from "@/shared/constants";
import {
  MapleConfig,
  DEFAULT_CONFIG,
  CONFIG_SECTION,
  CONFIG_CHANGED_NOTIFICATION,
} from "@/shared/config";

let client: LanguageClient | undefined;
let completionProviderDisposable: vscode.Disposable | undefined;

/**
 * Read the current `maple.*` workspace configuration.
 */
function readConfig(): MapleConfig {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    enable: cfg.get<boolean>("enable", DEFAULT_CONFIG.enable),
    documentSelector: cfg.get<string>(
      "documentSelector",
      DEFAULT_CONFIG.documentSelector,
    ),
  };
}

/**
 * Build a VS Code DocumentSelector from the MapleConfig.
 *
 * - If `documentSelector` is a non-empty glob, every scheme gets that pattern.
 * - Otherwise fall back to the hardcoded language list.
 */
function buildDocumentSelector(config: MapleConfig): vscode.DocumentSelector {
  if (config.documentSelector) {
    return [{ pattern: config.documentSelector, scheme: "file" }];
  }
  return DOCUMENT_SELECTOR;
}

export async function activate(context: vscode.ExtensionContext) {
  const config = readConfig();

  // Register the restart command unconditionally — it's always safe to expose.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "maple-intellisense.restart",
      restartServer,
    ),
  );

  if (config.enable) {
    await startExtension(context, config);
  }

  // Watch for configuration changes and apply them live.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        const newConfig = readConfig();
        await handleConfigChange(context, newConfig);
      }
    }),
  );
}

/**
 * Start the LSP client and register the completion provider.
 */
async function startExtension(
  context: vscode.ExtensionContext,
  config: MapleConfig,
) {
  const serverModule = context.asAbsolutePath(
    path.join("dist", "server", "server.js"),
  );

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const docSelector = buildDocumentSelector(config);

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "html" },
      { scheme: "file", language: "css" },
      { scheme: "file", language: "javascript" },
      { scheme: "file", language: "typescript" },
      { scheme: "file", language: "javascriptreact" },
      { scheme: "file", language: "typescriptreact" },
      { scheme: "file", language: "vue" },
      { scheme: "file", language: "svelte" },
    ],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/.clientrc"),
    },
  };

  client = new LanguageClient(
    "mapleLsp",
    "Maple Language Server",
    serverOptions,
    clientOptions,
  );

  await client.start();

  // Send initial config to the server so it can filter on its side too.
  await client.sendNotification(CONFIG_CHANGED_NOTIFICATION, config);

  // Register completion provider using the (possibly glob-filtered) selector.
  completionProviderDisposable =
    vscode.languages.registerCompletionItemProvider(
      docSelector,
      {
        provideCompletionItems: completionItemProvider,
        resolveCompletionItem: completionItemResolver,
      },
      ...TRIGGER_CHARS,
    );

  context.subscriptions.push(completionProviderDisposable);
}

/**
 * Stop the LSP client and dispose the completion provider.
 */
async function stopExtension() {
  completionProviderDisposable?.dispose();
  completionProviderDisposable = undefined;

  if (client) {
    await client.stop();
    client = undefined;
  }
}

/**
 * React to live configuration changes without requiring a window reload.
 */
async function handleConfigChange(
  context: vscode.ExtensionContext,
  newConfig: MapleConfig,
) {
  if (!newConfig.enable) {
    // Extension was disabled — tear everything down.
    await stopExtension();
    return;
  }

  if (!client) {
    // Extension was disabled before; re-start it now that it's enabled again.
    await startExtension(context, newConfig);
    return;
  }

  // Extension is already running — just propagate the new config to the server.
  await client.sendNotification(CONFIG_CHANGED_NOTIFICATION, newConfig);

  // If the documentSelector changed, we need to re-register the completion
  // provider with the new selector. The LSP server handles its own filtering.
  if (completionProviderDisposable) {
    completionProviderDisposable.dispose();
    completionProviderDisposable = undefined;
  }
  const docSelector = buildDocumentSelector(newConfig);
  completionProviderDisposable =
    vscode.languages.registerCompletionItemProvider(
      docSelector,
      {
        provideCompletionItems: completionItemProvider,
        resolveCompletionItem: completionItemResolver,
      },
      ...TRIGGER_CHARS,
    );
  context.subscriptions.push(completionProviderDisposable);
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

async function restartServer() {
  if (!client) return;
  await client.stop();
  await client.start();
}
