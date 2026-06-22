import { parseClass } from "@f12io/maple";
import { ABBREVIATIONS, BUILTIN_ALIASES } from "../mapleEngine/data";

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
  const parsed = parseClass(word);

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
  const baseKey =
    parsed.utilKey || parsed.propKeyKebab || parsed.propKeyCamel || "";
  const activeWord = baseKey + utilOp + utilVal;

  const prefixes: string[] = [];
  if (parsed.mediaQuery) {
    prefixes.push(...parsed.mediaQuery.split(":"));
  }
  if (parsed.parentSel) prefixes.push(`^${parsed.parentSel}`);
  if (parsed.selfSel) prefixes.push(`&${parsed.selfSel}`);
  if (parsed.childSel) prefixes.push(`*${parsed.childSel}`);

  const activePrefix = parsed.utilKey;
  const activeParts = [parsed.utilKey, ...utilVal.split("-")];

  const cleanActiveWord = activeWord.startsWith("@")
    ? activeWord.substring(1)
    : activeWord;
  const cleanActiveWordWithoutImportant = cleanActiveWord.replace(/!$/, "");
  const activePrefixWithoutImportant = activePrefix.replace(/!$/, "");

  const isMaplePrefix =
    !!ABBREVIATIONS[activePrefixWithoutImportant] ||
    !!BUILTIN_ALIASES[cleanActiveWordWithoutImportant];
  const isMapleIntent =
    prefixes.length > 0 ||
    isMaplePrefix ||
    activeWord.startsWith("--alias-") ||
    activeWord.startsWith("@");

  return {
    activeWord,
    prefixes,
    activeParts,
    activePrefix,
    isMaplePrefix,
    isMapleIntent,
  };
}
