import { parseClass } from '@f12io/maple';
import { getUtilKey } from './get-util-key';

export type CompletionType =
  | 'media-query'
  | 'pseudo-class'
  | 'property'
  | 'value'
  | 'initial';

interface CompletionContext {
  types: CompletionType[];
  parsed?: ReturnType<typeof parseClass>;
}
/**
 * Helper to determine what type of completion to show based on parsed class
 */
export function getCompletionContextType(word: string): CompletionContext {
  // Empty word - show initial suggestions
  if (!word) {
    return { types: ['initial'] };
  }

  try {
    const parsed = parseClass(word);
    const utilKey = getUtilKey(parsed);
    if (utilKey === null) {
      return { types: [], parsed };
    }
    const indexOfUtilKey = parsed.srcClass?.lastIndexOf(utilKey) || 0;
    const prefix = parsed.srcClass?.slice(0, indexOfUtilKey) || '';
    const isPseudoClass = prefix.endsWith('&:');
    const types: CompletionType[] = [];

    const isValue =
      word.includes(`${parsed.utilKey}${parsed.utilOp}`) ||
      word.includes(`${parsed.propKeyCamel}${parsed.utilOp}`) ||
      word.includes(`${parsed.propKeyKebab}${parsed.utilOp}`);

    // If we have an operator (- or =), show value completions
    if (isValue) {
      types.push('value');
    } else {
      if (!isPseudoClass) {
        types.push('property');
      }
      types.push('pseudo-class');
    }

    // If it starts with @, it's a viewport media query
    if (word.startsWith('@') && !isPseudoClass) {
      types.push('media-query');
    }

    if (
      !parsed.parentSel &&
      !parsed.selfSel &&
      !parsed.childSel &&
      !types.includes('media-query') &&
      !isPseudoClass &&
      !isValue
    ) {
      types.push('media-query');
    }

    // Default to property completions - use the raw word as prefix
    return {
      types,
      parsed: {
        ...parsed,
        propType: parsed.utilKey === 'square' ? 1 : parsed.propType,
      },
    };
  } catch {
    if (word.startsWith('@')) {
      return { types: ['media-query'] };
    }
    if (word.startsWith('&')) {
      return { types: ['pseudo-class'] };
    }
    return { types: ['property'] };
  }
}
