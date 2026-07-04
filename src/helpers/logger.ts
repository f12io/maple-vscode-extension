import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('Maple CSS');
  }
  return channel;
}

export function initLogger(context: vscode.ExtensionContext): void {
  context.subscriptions.push(getChannel());
}

export function logError(scope: string, error: unknown): void {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  getChannel().appendLine(`[${new Date().toISOString()}] [${scope}] ${message}`);
}

/**
 * Runs a provider callback and swallows unexpected errors so a single parse
 * failure cannot break editor features (completion, hover, highlighting, ...).
 * Errors are reported to the "Maple CSS" output channel.
 */
export function safeRun<T>(scope: string, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (error) {
    logError(scope, error);
    return fallback;
  }
}
