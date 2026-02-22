/**
 * Check if a string matches prefix (case-insensitive)
 */
export function matchesPrefix(text: string, prefix: string): boolean {
  if (!prefix) {
    return true;
  }
  return text.toLowerCase().includes(prefix.toLowerCase());
}
