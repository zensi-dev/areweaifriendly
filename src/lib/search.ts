/** Lowercase words separated by single spaces, accents and punctuation dropped: "Déjà Dup" → "deja dup", "Node.js" → "node js". */
export function normalize(text: string) {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function queryTerms(query: string) {
  return normalize(query).split(' ').filter(Boolean);
}

/** Everything a row matches against; the name also appears without spaces, so "nodejs" finds Node.js. */
export function searchText(name: string, ...fields: string[]) {
  const n = normalize(name);
  return [n, n.replaceAll(' ', ''), ...fields.map(normalize)].join(' ');
}

/** 4 exact, 3 prefix, 2 word start, 1 anywhere, 0 absent. */
function rank(text: string, needle: string) {
  if (text === needle) return 4;
  if (text.startsWith(needle)) return 3;
  if (` ${text}`.includes(` ${needle}`)) return 2;
  return text.includes(needle) ? 1 : 0;
}

/**
 * Relevance of one project for the query terms, 0 when a term is missing.
 * How well the whole query matches the name dominates; per-term name and word-start hits break ties,
 * so the project itself comes before projects that only mention it.
 */
export function searchScore(terms: string[], name: string, text: string) {
  if (!terms.every((t) => text.includes(t))) return 0;
  const query = terms.join(' ');
  const whole = Math.max(rank(name, query), rank(name.replaceAll(' ', ''), query.replaceAll(' ', '')));
  const perTerm = terms.reduce((sum, t) => sum + rank(name, t) * 10 + (rank(text, t) > 1 ? 1 : 0), 0);
  return 1 + whole * 1000 + perTerm;
}

export interface Searchable {
  /** `normalize`d name. */
  name: string;
  /** `searchText` output. */
  text: string;
}

/** Items matching every term, best first; equal scores put the shorter name first, then keep list order. */
export function rankMatches<T>(items: T[], terms: string[], fields: (item: T) => Searchable) {
  return items
    .map((item) => {
      const { name, text } = fields(item);
      return { item, name, score: searchScore(terms, name, text) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
    .map((r) => r.item);
}
