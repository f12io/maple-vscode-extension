import * as vscode from 'vscode';
import { HEAD_TAG_REGEX, MAPLE_SCRIPT_REGEX } from '../constants/regex';

export function isExtensionExplicitlyDisabled(): boolean {
  const config = vscode.workspace.getConfiguration('maple');
  const inspect = config.inspect<boolean>('enabled');
  if (
    inspect?.workspaceValue !== undefined ||
    inspect?.globalValue !== undefined
  ) {
    return !config.get<boolean>('enabled', false);
  }
  return false;
}

export function isExtensionEnabled(document?: vscode.TextDocument): boolean {
  if (isExtensionExplicitlyDisabled()) {
    return false;
  }

  const config = vscode.workspace.getConfiguration('maple');
  const inspect = config.inspect<boolean>('enabled');

  // If explicitly enabled by user
  if (
    inspect?.workspaceValue !== undefined ||
    inspect?.globalValue !== undefined
  ) {
    return true;
  }

  // If not explicitly set, default to false EXCEPT for HTML files with maple.js
  if (document?.languageId === 'html') {
    const text = document.getText();
    if (text.includes('maple.js') || text.includes('maple.min.js')) {
      const headMatch = HEAD_TAG_REGEX.exec(text);
      if (headMatch) {
        const headContent = headMatch[1];
        if (MAPLE_SCRIPT_REGEX.test(headContent)) {
          return true;
        }
      }
    }
  }

  return false;
}

export function isFeatureEnabled(
  featureName: 'diagnostics' | 'autoComplete' | 'colorPicker' | 'hoverHelp',
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
