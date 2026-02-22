import { coco, namedColors, parse } from '@f12io/coco';
import { COLOR_MID_TONE } from '../constants';

/**
 * findNamedColorAndTone
 * Reverse engineers a target HEX back to your design system
 */
export function findNamedColorAndTone(
  targetHex: string,
  toneFactor = 1,
  lightnessFactor = 1,
) {
  const targetOklch = coco(targetHex, 'oklch');
  const targetRgb = coco(targetHex, 'rgb');
  const target = parse(targetOklch);
  const tRGB = parse(targetRgb);
  if (!target || !tRGB) {
    return;
  }
  const tarRGB = tRGB?.coords;
  const [_, _1, h] = target.coords;
  const alpha = Math.round(target.alpha * 100);

  let bestMatch = { name: '', tone: 500, distance: Infinity };
  for (const [name, hex] of Object.entries(namedColors).sort(() => 1)) {
    if (!bestMatch.distance) {
      break;
    }
    const oklch = coco(`#${hex}`, 'oklch');
    const baseOklch = parse(oklch);
    if (!baseOklch) {
      continue;
    }
    const base = {
      l: baseOklch.coords[0],
      c: baseOklch.coords[1],
      h: baseOklch.coords[2],
    };

    // 1. QUICK FILTER: If Hue is significantly different, skip it.
    // OKLCH Hue is 0-360. We check if they are within 15 degrees.
    const hDiff = Math.abs(base.h - h);
    const hueDistance = Math.min(hDiff, 360 - hDiff);
    if (hueDistance > 30) continue;

    const canBestMatch = searchForTones(name, tarRGB, base);

    if (canBestMatch.distance < bestMatch.distance) {
      bestMatch = { ...canBestMatch };
    }
  }

  return bestMatch.name
    ? {
        name: bestMatch.name,
        tone: bestMatch.tone,
        id: `${bestMatch.name}-${bestMatch.tone}${alpha != 100 ? '/' : ''}${alpha !== 100 ? alpha : ''}`,
        distance: bestMatch.distance,
      }
    : null;
}

function searchForTones(name: string, tarRGB: Array<number>, base: any) {
  let bestMatch = { name: '', tone: 500, distance: Infinity };
  let localBestTone = 500;
  let minLDiff = Infinity;
  let prevDist = Infinity;
  for (let i = 0; i < 1000; i += 2) {
    const midTone = i;

    const amount = (COLOR_MID_TONE - midTone) / COLOR_MID_TONE;
    const adjAmount = amount;

    let simulatedL;
    if (amount === 0) {
      simulatedL = base.l;
    } else {
      const lCalc = amount > 0 ? (1 - base.l) * adjAmount : base.l * adjAmount;
      simulatedL = base.l + lCalc;
    }

    const simulatedRgb = coco(
      `oklch(${simulatedL} ${base.c} ${base.h})`,
      'rgb',
    );
    const simRGB = parse(simulatedRgb);
    const diff = tarRGB.reduce(
      (acc, v, i) => {
        acc += Math.abs(v - (simRGB?.coords?.[i] || 0));
        return acc;
      },
      (midTone % 100) / 1000,
    );

    if (diff < minLDiff) {
      if (prevDist < diff) {
        return bestMatch;
      }
      bestMatch = { name, tone: midTone, distance: diff };
      localBestTone = midTone;
      minLDiff = diff;
    }
  }
  return bestMatch;
}
