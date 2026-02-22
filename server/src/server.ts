import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  SemanticTokensRangeParams,
  SemanticTokensBuilder,
  SemanticTokensParams,
  ColorPresentationParams,
  DocumentColorParams,
  CancellationToken,
  TextDocumentPositionParams,
  Hover,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { semanticTokenBuilder } from "./helpers/semantic-token";
import { validateConflicts } from "./helpers/validate-conflicts";
import { prepareColorPresentation, scanColors } from "./helpers/color-provider";
import { hoverProvider } from "./helpers/hover-provider";
import {
  MapleConfig,
  DEFAULT_CONFIG,
  CONFIG_CHANGED_NOTIFICATION,
} from "@/shared/config";
import { minimatch } from "minimatch";

let debounceTimer: NodeJS.Timeout;

// Active configuration — updated via CONFIG_CHANGED_NOTIFICATION from the client.
let config: MapleConfig = { ...DEFAULT_CONFIG };

// 1. Establish the connection using IPC
const connection = createConnection(ProposedFeatures.all);

// 2. Manage open text documents
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      // Support incremental updates to documents
      textDocumentSync: TextDocumentSyncKind.Incremental,
      semanticTokensProvider: {
        legend: {
          tokenTypes: [
            "maple-mediaQuery",
            "maple-utility",
            "maple-value",
            "maple-parent-selector",
            "maple-self-selector",
            "maple-child-selector",
            "maple-separator",
          ],
          tokenModifiers: [],
        },
        range: true,
        full: true,
      },
      hoverProvider: true,
      colorProvider: true,
    },
  };
  return result;
});

/**
 * Receive config pushes from the client (sent on activate and on every change).
 */
connection.onNotification(
  CONFIG_CHANGED_NOTIFICATION,
  (newConfig: MapleConfig) => {
    config = { ...DEFAULT_CONFIG, ...newConfig };
  },
);

/**
 * Returns true if the given document URI is permitted by the current
 * documentSelector glob (or if no glob is configured).
 */
function isUriAllowed(uri: string): boolean {
  if (!config.documentSelector) {
    return true; // no restriction
  }
  // Convert file:// URI to a path minimatch can work with.
  let fsPath = uri;
  try {
    fsPath = new URL(uri).pathname;
  } catch {
    // keep original
  }
  return minimatch(fsPath, config.documentSelector, {
    matchBase: true,
    dot: true,
  });
}

connection.languages.semanticTokens.on((params: SemanticTokensParams) => {
  if (!config.enable || !isUriAllowed(params.textDocument.uri)) {
    return { data: [] };
  }
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return { data: [] };
  }
  const builder = new SemanticTokensBuilder();
  const lineCount = document.lineCount;
  for (let i = 0; i <= lineCount; i++) {
    const lineText = document.getText({
      start: { line: i, character: 0 },
      end: { line: i, character: Number.MAX_VALUE },
    });
    semanticTokenBuilder(lineText, i, builder);
  }
  return builder.build();
});

connection.languages.semanticTokens.onRange(
  (params: SemanticTokensRangeParams) => {
    if (!config.enable || !isUriAllowed(params.textDocument.uri)) {
      return { data: [] };
    }
    const document = documents.get(params.textDocument.uri);
    if (!document) return { data: [] };

    const builder = new SemanticTokensBuilder();
    const { start, end } = params.range;
    for (let i = start.line; i <= end.line; i++) {
      const lineText = document.getText({
        start: { line: i, character: 0 },
        end: { line: i, character: Number.MAX_VALUE },
      });
      semanticTokenBuilder(lineText, i, builder);
    }
    return builder.build();
  },
);

connection.onDocumentColor(
  async (params: DocumentColorParams, token: CancellationToken) => {
    if (!config.enable || !isUriAllowed(params.textDocument.uri)) {
      return [];
    }
    if (!params.textDocument?.uri) {
      return [];
    }
    if (token.isCancellationRequested) {
      return [];
    }
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    await new Promise((resolve) => setImmediate(resolve));
    if (token.isCancellationRequested) return [];
    const colors = scanColors(document, token);
    return colors;
  },
);

connection.onColorPresentation((params: ColorPresentationParams) => {
  if (!config.enable || !isUriAllowed(params.textDocument.uri)) {
    return null;
  }
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  return prepareColorPresentation(document, params);
});

connection.onHover(
  async (params: TextDocumentPositionParams): Promise<Hover | null> => {
    if (!config.enable || !isUriAllowed(params.textDocument.uri)) {
      return null;
    }
    const document = documents.get(params.textDocument.uri);
    return await hoverProvider(document, params);
  },
);

documents.onDidChangeContent((change) => {
  if (!config.enable || !isUriAllowed(change.document.uri)) {
    // Clear any existing diagnostics for this document.
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics: [] });
    return;
  }
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const diagnostics = validateConflicts(change.document);
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
  }, 300);
});

connection.onDidCloseTextDocument((params) => {
  connection.sendDiagnostics({ uri: params.textDocument.uri, diagnostics: [] });
});

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();
