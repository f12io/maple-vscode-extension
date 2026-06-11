import { parse, coco, namedColors, createCoco } from "@f12io/coco";
import { ABBREVIATIONS } from "../mapleEngine/data";

const COLOR_MID_TONE = 500;

function calculateNamedColorAndToneToHex(input: string) {
  const [nt, opacity] = input.split("/");
  const [name, t] = nt.split("-");

  const alpha = (opacity ? parseInt(opacity) : 100) / 100;
  const tone = t ? parseInt(t) : 500;

  if (!namedColors[name]) {
    return undefined;
  }
  const hex = `#${namedColors[name]}`;
  const oklch = coco(hex, "oklch");
  if (!oklch) return undefined;
  const converted = parse(oklch);
  if (!converted) {
    return undefined;
  }
  const amount = (COLOR_MID_TONE - tone) / COLOR_MID_TONE;
  const [l, c, h] = converted.coords;
  const lCalc = l + (amount > 0 ? 1 - l : l) * amount;
  const target = `oklch(${lCalc} ${c} ${h} / ${alpha})`;
  return coco(target, "hex") || undefined;
}

const baseColorOKLCH: Record<string, { l: number; c: number; h: number }> = {};
for (const [name, hex] of Object.entries(namedColors)) {
  const oklchStr = coco(`#${hex}`, "oklch");
  if (oklchStr) {
    const parsed = parse(oklchStr);
    if (parsed) {
      baseColorOKLCH[name] = {
        l: parsed.coords[0],
        c: parsed.coords[1],
        h: parsed.coords[2],
      };
    }
  }
}

export function findNamedColorAndTone(hex: string): { id: string } | undefined {
  const targetOklchStr = coco(hex, "oklch");
  if (!targetOklchStr) return undefined;
  const parsedTarget = parse(targetOklchStr);
  if (!parsedTarget) return undefined;
  const [l_t, c_t, h_t] = parsedTarget.coords;

  let bestName = undefined;
  let minDistance = Infinity;

  for (const [name, base] of Object.entries(baseColorOKLCH)) {
    let dh = 0;
    if (c_t >= 0.005 && base.c >= 0.005 && !isNaN(h_t) && !isNaN(base.h)) {
      dh = Math.min(Math.abs(h_t - base.h), 360 - Math.abs(h_t - base.h));
    } else if (
      (c_t < 0.005 && base.c >= 0.005) ||
      (c_t >= 0.005 && base.c < 0.005)
    ) {
      dh = 180;
    }

    const dc = Math.abs(c_t - base.c);
    const dist = Math.sqrt(dh * dh + dc * dc * 10000);
    if (dist < minDistance) {
      minDistance = dist;
      bestName = name;
    }
  }

  if (!bestName) return undefined;

  const L = baseColorOKLCH[bestName].l;
  let amount = 0;
  if (l_t > L && L < 1) {
    amount = (l_t - L) / (1 - L);
  } else if (l_t < L && L > 0) {
    amount = (l_t - L) / L;
  }

  let tone = Math.round(500 - amount * 500);
  if (tone < 0) tone = 0;
  if (tone > 999) tone = 999;

  // Smooth out floating point rounding errors to nearest 10 if very close
  const nearest10 = Math.round(tone / 10) * 10;
  if (Math.abs(tone - nearest10) <= 2) {
    tone = nearest10;
  }

  if (l_t >= 0.999) return { id: `white` };
  if (l_t <= 0.001) return { id: `black` };

  return { id: `${bestName}-${tone}` };
}

export const cocoWithResolver = createCoco({
  nameResolver: (name) => {
    return calculateNamedColorAndToneToHex(name);
  },
  valueResolver: (color: any) => {
    const hex6 = coco(color.meta?.originalInput || color.rgb, "hex6");
    return findNamedColorAndTone(hex6 || "")?.id || undefined;
  },
});

export const colorPrefixes = Object.keys(ABBREVIATIONS).filter((k) => {
  const p = ABBREVIATIONS[k].toLowerCase();
  return (
    p.includes("color") ||
    p.includes("background") ||
    p.includes("fill") ||
    p.includes("stroke")
  );
});
