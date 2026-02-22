import { Range, TextDocument } from 'vscode-languageserver-textdocument';
import { buildRule, convert } from '@f12io/maple';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { classAttrRegex } from '@/shared/constants';

export function validateConflicts(textDocument: TextDocument) {
  const lineCount = textDocument.lineCount;
  const diagnostics: Diagnostic[] = [];
  for (let i = 0; i <= lineCount; i++) {
    const seenSelectors = new Map<string, { range: Range; isAdded: boolean }>();

    const lineText = textDocument.getText({
      start: { line: i, character: 0 },
      end: { line: i, character: Number.MAX_VALUE },
    });
    classAttrRegex.lastIndex = 0;
    const match = classAttrRegex.exec(lineText);
    if (!match) {
      continue;
    }
    const fullMatch = match[0];
    let classContent = match[2]; // Bütün sınıflar dizisi
    const contentRelativeIndex = fullMatch.indexOf(classContent);
    let attrIndex = match.index + contentRelativeIndex;
    const cleanClasses = classContent
      .split(/\s+/) // Split by whitespace
      .filter((c) => c.length > 0); // Remove empty strings
    for (let className of cleanClasses) {
      const converted = convert(className);
      if (!converted) {
        classContent = classContent.replace(className, '');
        attrIndex += className.length;
        continue;
      }
      const rule = buildRule(className);
      const parsed = rule?.parsed;
      if (!parsed) {
        classContent = classContent.replace(className, '');
        attrIndex += className.length;
        continue;
      }
      const conflictKey = parsed.conflictKey;
      if (!conflictKey) {
        classContent = classContent.replace(className, '');
        attrIndex += className.length;
        continue;
      }
      const currentOffset = classContent.indexOf(className) + attrIndex;

      const previousSelector = seenSelectors.get(conflictKey);
      if (!!previousSelector) {
        if (!previousSelector.isAdded) {
          previousSelector.isAdded = true;
          seenSelectors.set(conflictKey, previousSelector);
          diagnostics.push(generateDiagnositc(previousSelector.range));
        }
        diagnostics.push(
          generateDiagnositc({
            start: { line: i, character: currentOffset },
            end: { line: i, character: currentOffset + className.length },
          }),
        );
      } else {
        seenSelectors.set(conflictKey, {
          range: {
            start: { line: i, character: currentOffset },
            end: { line: i, character: currentOffset + className.length },
          },
          isAdded: false,
        });
      }
      classContent = classContent.replace(className, '');
      attrIndex += className.length;
    }
  }
  return diagnostics;
}

function generateDiagnositc(range: Range): Diagnostic {
  return {
    severity: DiagnosticSeverity.Warning,
    range,
    message: `Conflicted utility usage`,
    source: 'Maple',
  };
}
