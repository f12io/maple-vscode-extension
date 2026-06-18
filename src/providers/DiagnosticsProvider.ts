import {
  buildRule,
  COLOR_MAX_TONE,
  COLOR_MIN_TONE,
  convert,
  PRECALCULATED_PROP_TYPES,
  REGEX_COLOR_TOKEN,
  REGEX_RESERVED_KEYWORDS,
} from "@f12io/maple";
import * as vscode from "vscode";
import {
  extractAllClasses,
  MAPLE_CLASS_REGEX,
} from "../helpers/class-extractor";
import { isExtensionEnabled } from "../helpers/config";
import { parseMapleToken } from "../helpers/maple-parser";
import { ABBREVIATIONS, BUILTIN_ALIASES } from "../mapleEngine/data";

const validProperties = Object.keys(PRECALCULATED_PROP_TYPES || {});

export function refreshDiagnostics(
  doc: vscode.TextDocument,
  mapleDiagnostics: vscode.DiagnosticCollection,
): void {
  if (!isExtensionEnabled()) {
    mapleDiagnostics.set(doc.uri, []);
    return;
  }

  const diagnostics: vscode.Diagnostic[] = [];
  const text = doc.getText();

  const classInstances = extractAllClasses(text);

  for (const instance of classInstances) {
    const classValue = instance.value;
    const seenSelectors = new Map<
      string,
      { range: vscode.Range; isAdded: boolean }
    >();

    MAPLE_CLASS_REGEX.lastIndex = 0;
    let wordMatch;
    while ((wordMatch = MAPLE_CLASS_REGEX.exec(classValue))) {
      const cls = wordMatch[0];

      const {
        activeWord,
        prefixes,
        activePrefix,
        activeParts,
        isMaplePrefix,
        isMapleIntent,
      } = parseMapleToken(cls);

      if (!isMapleIntent) {
        continue;
      }

      let hasError = false;
      let errorMsg = "";

      if (isMapleIntent) {
        // Let the engine validate the syntax
        const rule = buildRule(cls);
        const converted = convert(cls);

        if (
          activeWord.startsWith("--alias-") &&
          activeWord.includes("=") &&
          instance.tagName &&
          instance.tagName !== "html"
        ) {
          hasError = true;
          errorMsg = `Maple aliases can only be defined on the 'html' element. Found on '${instance.tagName}'.`;
        } else if ((!rule || !rule.content) && !converted) {
          hasError = true;
          errorMsg = `Invalid maple class: '${cls}'`;
        } else if (rule && rule.parsed && rule.parsed.utilOp === "-" && !rule.parsed.utilVal.startsWith("[") && rule.parsed.utilVal.includes("_!important")) {
          hasError = true;
          errorMsg = `Invalid usage of '!important'. Use '=' operator or '[]' brackets for string literals.`;
        } else if (
          !BUILTIN_ALIASES[activeWord] &&
          activeWord.includes("-") &&
          !activeWord.startsWith("--")
        ) {
          // Check for abbreviation typos if rule parses
          if (
            !ABBREVIATIONS[activePrefix] &&
            !validProperties.includes(activePrefix) &&
            prefixes.length > 0
          ) {
            hasError = true;
            errorMsg = `Unknown maple abbreviation: '${activePrefix}'`;
          } else if (ABBREVIATIONS[activePrefix]) {
            const prop = ABBREVIATIONS[activePrefix].toLowerCase();
            const isColorProp =
              prop.includes("color") ||
              prop.includes("background") ||
              prop.includes("fill") ||
              prop.includes("stroke");

            if (isColorProp) {
              const utilVal = activeParts.slice(1).join("-");
              const colorMatch = REGEX_COLOR_TOKEN.exec(utilVal);

              if (colorMatch) {
                const colorName = colorMatch[1];
                const tonePart = colorMatch[2];

                if (
                  colorName &&
                  !REGEX_RESERVED_KEYWORDS.test(colorName) &&
                  tonePart
                ) {
                  const numTone = Number(tonePart);
                  if (numTone < COLOR_MIN_TONE || numTone > COLOR_MAX_TONE) {
                    hasError = true;
                    errorMsg = `Invalid color tone: '${tonePart}'. Must be between ${COLOR_MIN_TONE} and ${COLOR_MAX_TONE}.`;
                  }
                }
              }
            }
          }
        }
      }

      if (hasError) {
        const startIdx = instance.start + wordMatch.index;
        const endIdx = startIdx + cls.length;

        const range = new vscode.Range(
          doc.positionAt(startIdx),
          doc.positionAt(endIdx),
        );

        const diagnostic = new vscode.Diagnostic(
          range,
          errorMsg,
          vscode.DiagnosticSeverity.Warning,
        );
        diagnostic.source = "Maple";
        diagnostics.push(diagnostic);
      } else if (isMapleIntent) {
        // If it's valid, check for conflicts
        const converted = convert(cls);
        if (converted) {
          const rule = buildRule(cls);
          const conflictKey = rule?.parsed?.conflictKey;

          if (conflictKey) {
            const startIdx = instance.start + wordMatch.index;
            const endIdx = startIdx + cls.length;
            const range = new vscode.Range(
              doc.positionAt(startIdx),
              doc.positionAt(endIdx),
            );

            const previousSelector = seenSelectors.get(conflictKey);
            if (previousSelector) {
              if (!previousSelector.isAdded) {
                previousSelector.isAdded = true;
                seenSelectors.set(conflictKey, previousSelector);

                const firstDiagnostic = new vscode.Diagnostic(
                  previousSelector.range,
                  `Conflicted utility usage: '${conflictKey}'`,
                  vscode.DiagnosticSeverity.Warning,
                );
                firstDiagnostic.source = "Maple";
                diagnostics.push(firstDiagnostic);
              }

              const diagnostic = new vscode.Diagnostic(
                range,
                `Conflicted utility usage: '${conflictKey}'`,
                vscode.DiagnosticSeverity.Warning,
              );
              diagnostic.source = "Maple";
              diagnostics.push(diagnostic);
            } else {
              seenSelectors.set(conflictKey, { range, isAdded: false });
            }
          }
        }
      }
    }
  }

  mapleDiagnostics.set(doc.uri, diagnostics);
}

export function subscribeToDocumentChanges(
  context: vscode.ExtensionContext,
  mapleDiagnostics: vscode.DiagnosticCollection,
): void {
  if (vscode.window.activeTextEditor) {
    refreshDiagnostics(
      vscode.window.activeTextEditor.document,
      mapleDiagnostics,
    );
  }
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        refreshDiagnostics(editor.document, mapleDiagnostics);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) =>
      refreshDiagnostics(e.document, mapleDiagnostics),
    ),
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) =>
      mapleDiagnostics.delete(doc.uri),
    ),
  );
}
