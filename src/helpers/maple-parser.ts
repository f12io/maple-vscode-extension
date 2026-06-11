import { ABBREVIATIONS, BUILTIN_ALIASES } from "../mapleEngine/data";
import { buildRule } from "@f12io/maple";

export interface MapleTokenInfo {
  activeWord: string;
  prefixes: string[];
  activeParts: string[];
  activePrefix: string;
  isMaplePrefix: boolean;
  isMapleIntent: boolean;
}

/**
 * Parses a word into its maple parts (prefixes, utility, etc.)
 * and checks if it's a valid maple intent.
 *
 * E.g., "@md:hover:bgc-red-500" ->
 * activeWord: "bgc-red-500"
 * prefixes: ["@md", "hover"]
 * activePrefix: "bgc"
 */
export function parseMapleToken(word: string): MapleTokenInfo {
  const rule = buildRule(word);
  const parsed = rule?.parsed;

  if (!parsed) {
    return {
      activeWord: word,
      prefixes: [],
      activeParts: [],
      activePrefix: "",
      isMaplePrefix: false,
      isMapleIntent: false,
    };
  }

  const utilOp = parsed.utilOp || "";
  const utilVal = parsed.utilVal || "";
  const activeWord = parsed.utilKey + utilOp + utilVal;

  const prefixes: string[] = [];
  if (parsed.mediaQuery) {
    prefixes.push(...parsed.mediaQuery.split(":"));
  }
  if (parsed.parentSel) prefixes.push(`^${parsed.parentSel}`);
  if (parsed.selfSel) prefixes.push(`&${parsed.selfSel}`);
  if (parsed.childSel) prefixes.push(`*${parsed.childSel}`);

  const activePrefix = parsed.utilKey;
  const activeParts = [parsed.utilKey, ...utilVal.split("-")];

  const isMaplePrefix =
    !!ABBREVIATIONS[activePrefix] || !!BUILTIN_ALIASES[activeWord];
  const isMapleIntent = prefixes.length > 0 || isMaplePrefix;

  return {
    activeWord,
    prefixes,
    activeParts,
    activePrefix,
    isMaplePrefix,
    isMapleIntent,
  };
}
