import * as vscode from 'vscode';

export function isExtensionEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('maple')
    .get<boolean>('enabled', false);
}

export function isFeatureEnabled(
  featureName:
    | 'diagnostics'
    | 'autoComplete'
    | 'colorPicker'
    | 'hoverHelp',
): boolean {
  return vscode.workspace
    .getConfiguration('maple.features')
    .get<boolean>(featureName, true);
}

export function getHighlightingMode(): 'off' | 'minimal' | 'on' {
  return vscode.workspace
    .getConfiguration('maple.features')
    .get<'off' | 'minimal' | 'on'>('highlighting', 'on');
}
