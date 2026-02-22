export function getWordWithRange(lineText: string, charOffset: number) {
  // Maple characters: alpha-numeric, dashes, colons, brackets for arbitrary values
  const wordRegex = /[a-zA-Z0-9\-:&\/\^|\[\]%#.]+/g;
  let match;

  while ((match = wordRegex.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (charOffset >= start && charOffset <= end) {
      return { start, end };
    }
  }
  return null;
}
