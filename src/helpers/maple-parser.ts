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

export function isAliasMarker(word: string): boolean {
  return word.startsWith("@");
}

export function isAliasDefinition(word: string): boolean {
  return word.startsWith("--alias-");
}

export function isVariable(word: string): boolean {
  return word.startsWith("--") && !isAliasDefinition(word);
}

export function stripImportant(word: string): string {
  return word.replace(/!$/, "");
}

export function getAliasName(word: string): string {
  const stripped = stripImportant(word);
  return isAliasMarker(stripped) ? stripped.substring(1) : stripped;
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

  const cleanActiveWord = isAliasMarker(activeWord)
    ? activeWord.substring(1)
    : activeWord;
  const cleanActiveWordWithoutImportant = stripImportant(cleanActiveWord);
  const activePrefixWithoutImportant = stripImportant(activePrefix);

  const isMaplePrefix =
    !!ABBREVIATIONS[activePrefixWithoutImportant] ||
    !!BUILTIN_ALIASES[cleanActiveWordWithoutImportant];
  const isMapleIntent =
    prefixes.length > 0 ||
    isMaplePrefix ||
    isAliasDefinition(activeWord) ||
    isAliasMarker(activeWord);

  return {
    activeWord,
    prefixes,
    activeParts,
    activePrefix,
    isMaplePrefix,
    isMapleIntent,
  };
}
