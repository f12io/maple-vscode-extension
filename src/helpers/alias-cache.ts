import * as fs from 'fs';
import * as vscode from 'vscode';
import {
  getLanguageIdFromExtension,
  SUPPORTED_FILES_GLOB,
} from '../constants/languages';
import { ALIAS_REGEX } from '../constants/regex';
import { LanguageServiceRegistry } from '../services/LanguageServiceRegistry';

/**
 * A workspace-wide cache that scans files for custom Maple aliases
 * and stores them per WorkspaceFolder to ensure isolation.
 */
export class AliasCache {
  // Map of workspaceFolder.uri.toString() -> Map<fileUri.toString(), Map<aliasName, expansionString>>
  private static cache = new Map<string, Map<string, Map<string, string>>>();

  // Event emitter for alias updates
  public static readonly onDidUpdateAliases = new vscode.EventEmitter<void>();

  public static init(context: vscode.ExtensionContext) {
    // Initial scan
    void this.scanAllWorkspaces();

    // Setup File Watchers for all supported file types
    const watcher =
      vscode.workspace.createFileSystemWatcher(SUPPORTED_FILES_GLOB);

    context.subscriptions.push(watcher);

    watcher.onDidChange((uri) => this.processFile(uri));
    watcher.onDidCreate((uri) => this.processFile(uri));
    watcher.onDidDelete((uri) => this.removeFile(uri));

    // When workspace folders change, do a full rescan
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.scanAllWorkspaces();
      }),
    );
  }

  /**
   * Get aliases for a specific document URI.
   * Looks up the workspace folder the document belongs to.
   */
  public static getAliases(uri: vscode.Uri): Map<string, string> {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) {
      return new Map<string, string>();
    }

    const folderCache = this.cache.get(folder.uri.toString());
    if (!folderCache) return new Map<string, string>();

    // Flatten all file caches into a single map for this folder
    const allAliases = new Map<string, string>();
    for (const fileMap of folderCache.values()) {
      for (const [alias, expansion] of fileMap.entries()) {
        allAliases.set(alias, expansion);
      }
    }
    return allAliases;
  }

  private static async scanAllWorkspaces() {
    this.cache.clear();

    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      this.onDidUpdateAliases.fire();
      return;
    }

    // Initialize maps for all folders
    for (const folder of folders) {
      this.cache.set(
        folder.uri.toString(),
        new Map<string, Map<string, string>>(),
      );
    }

    try {
      // Find files but exclude node_modules and .git
      const files = await vscode.workspace.findFiles(
        SUPPORTED_FILES_GLOB,
        '**/{node_modules,.git}/**',
      );

      for (const file of files) {
        await this.processFile(file, false);
      }
    } catch (error) {
      console.error('Error scanning workspace for aliases:', error);
    }
    this.onDidUpdateAliases.fire();
  }

  private static async processFile(uri: vscode.Uri, fireEvent = true) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) return;

    try {
      // Read file content
      const content = await fs.promises.readFile(uri.fsPath, 'utf-8');

      const fileMap = new Map<string, string>();
      const ext = uri.fsPath.split('.').pop()?.toLowerCase();
      const languageId = getLanguageIdFromExtension(ext);

      this.parseContentIntoMap(content, fileMap, languageId);

      const folderKey = folder.uri.toString();
      if (!this.cache.has(folderKey)) {
        this.cache.set(folderKey, new Map<string, Map<string, string>>());
      }

      const folderMap = this.cache.get(folderKey)!;
      if (fileMap.size > 0) {
        folderMap.set(uri.toString(), fileMap);
      } else {
        folderMap.delete(uri.toString());
      }

      if (fireEvent) {
        this.onDidUpdateAliases.fire();
      }
    } catch (ignoreError) {
      // Ignore file read errors (e.g. file locked or deleted)
    }
  }

  private static removeFile(uri: vscode.Uri) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) return;

    const folderKey = folder.uri.toString();
    const folderMap = this.cache.get(folderKey);
    if (folderMap) {
      folderMap.delete(uri.toString());
    }
  }

  private static parseContentIntoMap(
    content: string,
    map: Map<string, string>,
    languageId: string,
  ) {
    const service = LanguageServiceRegistry.getService(languageId);
    if (!service) return;
    const instances = service.extractClasses(content);
    for (const instance of instances) {
      if (!instance.tagName || instance.tagName === 'html') {
        const classStr = instance.value;
        // Aliases are separated by spaces like any other classes
        const tokens = classStr.split(/\s+/);
        for (const token of tokens) {
          for (const match of token.matchAll(ALIAS_REGEX)) {
            map.set(match[1], match[2]);
          }
        }
      }
    }
  }
}
