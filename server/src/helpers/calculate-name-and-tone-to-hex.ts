import { coco, namedColors, parse } from '@f12io/coco';
import { COLOR_MID_TONE } from '../constants';

export function calculateNamedColorAndToneToHex(input: string) {
  const [nt, opacity] = input.split('/');
  const [name, t] = nt.split('-');

  const alpha = (opacity ? parseInt(opacity) : 100) / 100;
  const tone = t ? parseInt(t) : 500;

  if (!namedColors[name]) {
    return undefined;
  }
  const hex = `#${namedColors[name]}`;
  const oklch = coco(hex, 'oklch');
  const converted = parse(oklch);
  if (!converted) {
    return undefined;
  }
  const amount = (COLOR_MID_TONE - tone) / COLOR_MID_TONE;
  const [l, c, h] = converted.coords;
  const lCalc = l + (amount > 0 ? 1 - l : l) * amount;
  const target = `oklch(${lCalc} ${c} ${h} / ${alpha})`;
  return coco(target, 'hex') || undefined;
}
