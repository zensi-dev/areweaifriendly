/**
 * Loose-but-honest matching: ignores case, whitespace, typographic quotes and
 * Markdown emphasis, so a model copying "**must** disclose" as "must disclose"
 * still matches, while any reworded quote does not.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’‛`´]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[*_#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function quoteAppearsIn(quote: string, text: string): boolean {
  const q = normalizeForMatch(quote);
  return q.length > 0 && normalizeForMatch(text).includes(q);
}
