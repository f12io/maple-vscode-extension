import { parseClass } from '@f12io/maple';

export function getUtilKey(parsed?: ReturnType<typeof parseClass>) {
  return parsed
    ? parsed.srcClass?.includes(`${parsed.utilKey || ''}${parsed.utilOp || ''}`)
      ? parsed.utilKey || ''
      : parsed.srcClass?.includes(
            `${parsed.propKeyCamel || ''}${parsed.utilOp || ''}`,
          )
        ? parsed.propKeyCamel || ''
        : parsed.srcClass?.includes(
              `${parsed.propKeyKebab || ''}${parsed.utilOp || ''}`,
            )
          ? parsed.propKeyKebab || ''
          : parsed.utilKey || ''
    : null;
}
