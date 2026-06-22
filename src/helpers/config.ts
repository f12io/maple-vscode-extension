import * as vscode from 'vscode';

export function isExtensionEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('maple')
    .get<boolean>('enabled', false);
}
