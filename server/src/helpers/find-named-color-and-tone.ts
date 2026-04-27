import { coco, namedColors, parse } from "@f12io/coco";
import { COLOR_MAX_TONE, COLOR_MID_TONE, COLOR_MIN_TONE } from "../constants";
import { createConnection, ProposedFeatures } from "vscode-languageserver/node";
const connection = createConnection(ProposedFeatures.all);

export function findNamedColorAndTone(targetHex: string) {
  const targetOklch = coco(targetHex, "oklch");
  const targetRgb = coco(targetHex, "rgb");
  const target = parse(targetOklch);
  if (!target) {
    return null;
  }
  const [targetL, targetC, targetH] = target?.coords;
  const MIN = COLOR_MIN_TONE; // 50
  const MAX = COLOR_MAX_TONE; // 950
  const MID = (MIN + MAX) / 2; // 500

  let bestMatch = { name: "", tone: 500, score: Infinity };

  const alpha = Math.round(target.alpha * 100);
  const library = Object.entries(namedColors).map(([name, hex]) => {
    const [l, h, c] = parse(coco(`#${hex}`, "oklch"))?.coords ?? [];
    return { name, l, h, c };
  });
  // 1. Convert namedColors library to OKLCH objects
  // Using standard console.log here so the objects appear expandible in the 'Debug Console' when you Attach to Server!
  for (const baseColor of library) {
    if (!baseColor.h || !baseColor.c) {
      continue;
    }
    // 2. Calculate Hue Distance (Circular)
    const dH = Math.min(
      Math.abs(targetH - baseColor.h),
      360 - Math.abs(targetH - baseColor.h),
    );

    // If hue is too different, this base color isn't a candidate (unless it's a gray)
    if (targetC > 0.02 && dH > 40) {
      continue;
    }

    /**
     * 3. Solve for Tone
     * Your logic: Tone 50 = Lightness 1.0 (High), Tone 950 = Lightness 0.0 (Low)
     * We map the targetL (0-1) to the 950-50 range.
     */
    const relativeL = 1 - targetL; // Invert because higher tone = darker
    let predictedTone = Math.round((relativeL * (MAX - MIN) + MIN) / 10) * 10;

    // Clamp to your constants
    predictedTone = Math.max(MIN, Math.min(MAX, predictedTone));

    // 4. Score the match
    // We prioritize Hue and Chroma similarity to find the best 'Name'
    const score = dH * 2 + Math.abs(targetC - baseColor.c) * 100;

    if (score < bestMatch.score) {
      bestMatch = { name: baseColor.name, tone: predictedTone, score };
    }
  }

  return bestMatch.name
    ? {
        name: bestMatch.name,
        tone: bestMatch.tone,
        id: `${bestMatch.name}-${bestMatch.tone}${alpha !== 100 ? "/" : ""}${alpha !== 100 ? alpha : ""}`,
        distance: bestMatch.score,
      }
    : null;
}
