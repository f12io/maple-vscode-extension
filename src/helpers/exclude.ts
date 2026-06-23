import * as picomatch from 'picomatch';
import * as vscode from 'vscode';

let cachedPatterns: Array<string> = [];
let matcher: picomatch.Matcher | null = null;

function getMatcher(): picomatch.Matcher {
  const config = vscode.workspace.getConfiguration('maple');
  const patterns = config.get<Array<string>>('exclude', [
    '**/node_modules/**',
    '**/.git/**',
  ]);

  // If patterns haven't changed, return the cached matcher
  if (matcher && JSON.stringify(patterns) === JSON.stringify(cachedPatterns)) {
    return matcher;
  }

  // Compile new matcher
  cachedPatterns = patterns;
  matcher = picomatch(patterns, { dot: true });
  return matcher;
}

export function isFileExcluded(uri: vscode.Uri): boolean {
  if (uri.scheme !== 'file') return false;

  const match = getMatcher();
  // We can pass the full path. Picomatch handles paths nicely.
  // Using relative path to workspace folder if possible
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  const pathToCheck = workspaceFolder
    ? vscode.workspace.asRelativePath(uri, false)
    : uri.fsPath;

  return match(pathToCheck);
}
