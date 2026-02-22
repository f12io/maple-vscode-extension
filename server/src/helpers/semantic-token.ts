import { SemanticTokensBuilder } from 'vscode-languageserver';
import { semanticTokenIndexes } from '../constants';
import { parseClass, convert } from '@f12io/maple';
import { getUtilKey } from './get-util-key';
import { classAttrRegex } from '@/shared/constants';

export function semanticTokenBuilder(
  lineText: string,
  line: number,
  builder: SemanticTokensBuilder,
) {
  classAttrRegex.lastIndex = 0;
  const match = classAttrRegex.exec(lineText);
  if (!match) {
    return;
  }
  const fullMatch = match[0];
  let classContent = match[2]; // Bütün sınıflar dizisi
  const contentRelativeIndex = fullMatch.indexOf(classContent);

  // The absolute position in the document
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
    const currentOffset = classContent.indexOf(className) + attrIndex;
    const parsedClass = parseClass(className);
    let mediaQuery = '';
    let parentSel = '';
    let selfSel = '';
    let childSel = '';
    let utilKey = '';
    if (parsedClass.mediaQuery) {
      mediaQuery = `${parsedClass.mediaQuery}:`;
      const wordOffset = className.indexOf(mediaQuery) + currentOffset;
      const startPos = wordOffset;
      className = className.replace(mediaQuery, '');
      builder.push(
        line,
        startPos,
        mediaQuery.length - 1,
        semanticTokenIndexes.mapleMediaQuery,
        0,
      );
      builder.push(
        line,
        currentOffset + mediaQuery.length - 1,
        1,
        semanticTokenIndexes.mapleSeparator,
        0,
      );
    }
    if (parsedClass.parentSel) {
      parentSel = `^${parsedClass.parentSel}`;
      const wordOffset = classContent.indexOf(parentSel) + attrIndex;
      const startPos = wordOffset;
      builder.push(
        line,
        startPos,
        parentSel.length,
        semanticTokenIndexes.mapleParentSelector,
        0,
      );
    }
    if (parsedClass.selfSel) {
      selfSel = `&${parsedClass.selfSel}`;
      const wordOffset = classContent.indexOf(selfSel) + attrIndex;
      builder.push(
        line,
        wordOffset,
        selfSel.length,
        semanticTokenIndexes.mapleSelfSelector,
        0,
      );
    }
    if (parsedClass.childSel) {
      childSel = `/${parsedClass.childSel}`;
      const wordOffset = classContent.indexOf(childSel) + attrIndex;
      builder.push(
        line,
        wordOffset,
        childSel.length,
        semanticTokenIndexes.mapleChildSelector,
        0,
      );
    }
    if (parsedClass.utilKey) {
      const othersLength =
        mediaQuery.length + parentSel.length + selfSel.length + childSel.length;
      const util = getUtilKey(parsedClass);
      if (!util) {
        continue;
      }
      utilKey = `${othersLength && othersLength !== mediaQuery.length ? ':' : ''}${util}`;
      const wordOffset =
        classContent.indexOf(parsedClass.srcClass) + attrIndex + othersLength;
      if (othersLength && othersLength !== mediaQuery.length) {
        builder.push(
          line,
          wordOffset,
          1,
          semanticTokenIndexes.mapleSeparator,
          0,
        );
      }
      builder.push(
        line,
        othersLength && othersLength !== mediaQuery.length
          ? wordOffset + 1
          : wordOffset,
        util.length,
        semanticTokenIndexes.mapleUtility,
        0,
      );
    }

    if (parsedClass.utilVal) {
      const othersLength =
        mediaQuery.length +
        parentSel.length +
        selfSel.length +
        childSel.length +
        utilKey.length;
      const wordOffset =
        classContent.indexOf(parsedClass.srcClass) + attrIndex + othersLength;
      builder.push(line, wordOffset, 1, semanticTokenIndexes.mapleSeparator, 0);
      builder.push(
        line,
        wordOffset + 1,
        parsedClass.utilVal.length,
        semanticTokenIndexes.mapleValue,
        0,
      );
    }

    classContent = classContent.replace(className, '');
    attrIndex += className.length;
  }
}
