/**
 * Diacritic-insensitive matching so "ao" finds "áo" and "danh muc" finds
 * "Danh mục" — the way people actually type when searching quickly.
 */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

/** True when every word typed appears somewhere in the haystack, in any order. */
export function matchesSearch(term: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = normalizeText(term.trim());
  if (!needle) return true;
  const haystack = normalizeText(fields.filter(Boolean).join(' '));
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}
