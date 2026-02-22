import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver';
import { classAttrRegex } from '@/shared/constants';

const lastWordRegex = /[\w-@^&/.:=|()]*$/;
const firstWordRegex = /^[\w-@^&/:.=|()]*/;

export function getWordAt(
  document: TextDocument,
  position: Position,
): { word: string; range: any } | null {
  const lineText = document.getText({
    start: { line: position.line, character: 0 },
    end: {
      line: position.line,
      character: Number.MAX_VALUE,
    }, // Adjust for very long lines
  });

  // 1. Check if we are inside a class attribute
  const match = classAttrRegex.exec(lineText);
  if (!match) return null;
  const classContent = match[2];
  const startIndex = match.index + match[0].indexOf(`${classContent}`);
  const slicedClassContent = classContent.slice(
    0,
    position.character - startIndex,
  );
  const lastWordStartAt = slicedClassContent.match(lastWordRegex)?.index || 0;
  const word =
    classContent.slice(lastWordStartAt).match(firstWordRegex)?.[0] || '';
  return {
    word,
    range: {
      start: { line: position.line, character: startIndex + lastWordStartAt },
      end: {
        line: position.line,
        character: startIndex + lastWordStartAt + word.length,
      },
    },
  };
}
