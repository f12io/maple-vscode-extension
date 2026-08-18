import { ALIAS_REGEX } from '../regex';

/**
 * Alias definitions usable in `text`: the ones written in the document, then
 * the host's own source (a workspace scan).
 *
 * The host wins on conflict: it sees definitions the document cannot, and is
 * what the editor resolves against everywhere else. Hosts with a single
 * document — a browser playground, say — pass nothing and still get the
 * in-document ones.
 */
export function collectAliasDefinitions(
  text: string,
  hostAliases: ReadonlyMap<string, string> | undefined,
): Map<string, string> {
  const aliases = new Map<string, string>();

  for (const match of text.matchAll(ALIAS_REGEX)) {
    aliases.set(match[1], match[2]);
  }
  if (hostAliases) {
    for (const [name, body] of hostAliases) aliases.set(name, body);
  }

  return aliases;
}

/** The names of {@link collectAliasDefinitions}, for callers that only match. */
export function collectAliasNames(
  text: string,
  hostAliases: ReadonlyMap<string, string> | undefined,
): Set<string> {
  return new Set(collectAliasDefinitions(text, hostAliases).keys());
}
