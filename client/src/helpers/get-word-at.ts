import { classAttrRegex } from '@/shared/constants';
import { Position, Range, TextDocument } from 'vscode';

const lastWordRegex = /[\w-@^&/.:=|()]*$/;

export function getWordAt(
  document: TextDocument,
  position: Position,
): { word: string; range: Range } | null {
  const lineText = document.lineAt(position.line).text;

  // 1. Check if we are inside a class attribute
  classAttrRegex.lastIndex = 0;
  const match = classAttrRegex.exec(lineText);
  if (!match) return null;
  const classContent = match[2];
  const startIndex = match.index + match[0].indexOf(`${classContent}`);
  const slicedClassContent = classContent.slice(
    0,
    position.character - startIndex,
  );
  lastWordRegex.lastIndex = 0;
  const lastWordMatch = slicedClassContent.match(lastWordRegex);
  const word = lastWordMatch?.[0] || '';
  const lastWordStartAt = lastWordMatch?.index || slicedClassContent.length;
  return {
    word,
    range: new Range(
      position.line,
      startIndex + lastWordStartAt,
      position.line,
      startIndex + lastWordStartAt + word.length,
    ),
  };
}
