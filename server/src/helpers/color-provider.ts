import {
  CancellationToken,
  ColorInformation,
  ColorPresentationParams,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { supportedColorTypes } from '../constants';
import { buildRule } from '@f12io/maple';
import { coco, createCoco, namedColors, parse } from '@f12io/coco';
import { findNamedColorAndTone } from './find-named-color-and-tone';
import { getUtilKey } from './get-util-key';
import { calculateNamedColorAndToneToHex } from './calculate-name-and-tone-to-hex';
import { getUnitForProperty } from '@/shared/get-unit-for-property';
import { classAttrRegex } from '@/shared/constants';
delete namedColors.burntsienna;
const cocoWithResolver = createCoco({
  nameResolver: (name) => {
    return calculateNamedColorAndToneToHex(name);
  },
  valueResolver: (color) => {
    const hex6 = coco(color.meta?.originalInput, 'hex6');
    return findNamedColorAndTone(hex6 || '')?.id || undefined;
  },
});

export function scanColors(document: TextDocument, token: CancellationToken) {
  const lineCount = document.lineCount;
  const colors: ColorInformation[] = [];
  for (let line = 0; line <= lineCount; line++) {
    const lineText = document.getText({
      start: { line, character: 0 },
      end: { line, character: Number.MAX_VALUE },
    });
    if (token.isCancellationRequested) return [];
    if (!lineText) {
      continue;
    }
    classAttrRegex.lastIndex = 0;
    const match = classAttrRegex.exec(lineText);
    if (!match) {
      continue;
    }
    const fullMatch = match[0];
    let classContent = match[2]; // Bütün sınıflar dizisi
    const contentRelativeIndex = fullMatch.indexOf(classContent);
    if (typeof classContent !== 'string') continue;
    // The absolute position in the document
    let attrIndex = (match?.index || 0) + contentRelativeIndex;
    const cleanClasses = classContent
      .split(/\s+/) // Split by whitespace
      .filter((c) => c.length > 0); // Remove empty strings
    for (let className of cleanClasses) {
      if (token.isCancellationRequested) return [];
      const built = buildRule(className);
      if (!built || !built.parsed) {
        classContent = classContent.replace(className, '');
        attrIndex += className.length;
        continue;
      }
      const parsed = built.parsed;
      const unit = getUnitForProperty(built.parsed.utilKey);
      if (parsed.propType !== 2 && unit !== null) {
        classContent = classContent.replace(className, '');
        attrIndex += className.length;
        continue;
      }
      const utilKey = getUtilKey(parsed);
      if (!utilKey) {
        classContent = classContent.replace(className, '');
        attrIndex += className.length;
        continue;
      }
      const utilKeyLength = utilKey.length + 1;
      const currentOffset = classContent.indexOf(className) + attrIndex;
      const values = parsed.utilVal
        .split('|')
        .map((it) => it.split('_'))
        .flat();
      let prevLength = 0;
      for (let val of values) {
        const rgba = cocoWithResolver(val, 'rgb');
        const parsedColor = parse(rgba);
        if (!parsedColor) {
          prevLength += val.length + 1;
          continue;
        }
        const [r, g, b] = parsedColor.coords;
        const offset =
          currentOffset + (prevLength ? prevLength + utilKeyLength : 0);
        colors.push({
          color: {
            red: r / 255,
            green: g / 255,
            blue: b / 255,
            alpha: parsedColor.alpha ?? 1,
          },
          range: {
            start: {
              line,
              character: offset,
            },
            end: {
              line,
              character: offset + (prevLength ? val.length : className.length),
            },
          },
        });
        prevLength += val.length + 1;
      }
      classContent = classContent.replace(className, '');
      attrIndex += className.length;
    }
  }
  return colors;
}

export function prepareColorPresentation(
  document: TextDocument,
  params: ColorPresentationParams,
) {
  const className = document.getText(params.range);
  const { red, green, blue, alpha } = params.color;
  const rgba = `rgba(${red * 255}, ${green * 255}, ${blue * 255}, ${alpha})`;
  const parsedClass = buildRule(className)?.parsed;

  const all = cocoWithResolver(rgba, 'all');

  const utilKey = getUtilKey(parsedClass);

  const lastIndex = className.lastIndexOf(
    `${utilKey}${parsedClass?.utilOp}${parsedClass?.utilVal}`,
  );
  const prefix = className.slice(0, lastIndex);

  return all
    ? supportedColorTypes.map((type) => {
        return type === 'rgb' && !all[type]
          ? {
              label: rgba,
              textEdit: {
                range: params.range,
                newText:
                  !parsedClass || parsedClass.propType !== 2
                    ? rgba
                    : `${prefix}${utilKey}${parsedClass.utilOp}${rgba}`,
              },
            }
          : {
              label: all[type],
              textEdit: {
                range: params.range,
                newText:
                  !parsedClass || parsedClass.propType !== 2
                    ? all[type]
                    : `${prefix}${utilKey}${parsedClass.utilOp}${all[type]}`,
              },
            };
      })
    : null;
}
