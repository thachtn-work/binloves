/*
  The public address of a product, a category or a collection, derived from
  the name its owner typed.

  Derived, and never typed. The shop's owner writes product names the way a
  seller writes them — emoji at both ends, an en dash for a pause, a comma in
  the middle — and none of that can go in a URL. Asking them to supply the URL
  too means asking them to perform a transliteration they have no reason to
  know, in a field that silently decides what every shared link and every
  search result for that product will look like. The system knows the rules;
  the owner knows the product. Each should do its own part.

  Shaped for a Vietnamese catalogue. NFD splits a letter from its tone mark so
  the mark can be dropped — `ế` becomes `e` — and `đ` is replaced outright,
  because it is a letter in its own right rather than a `d` wearing an accent,
  so no amount of decomposing will reduce it. Everything that survives neither
  step is a separator: a comma, a space, an en dash and a 💦 all mean the same
  thing here, which is "the word ended".

  Two rules the previous version missed, and they are why 199 of the 266
  products in this catalogue carry a malformed address:

    - Runs collapse. Three separators in a row are one hyphen, not three.
    - The ends are trimmed *after* collapsing, not before. A name that opens
      with an emoji opens with a separator, and a slug may not.

  The result is checked against the same pattern the rest of the system uses,
  not merely assumed to match it — this function is the only thing standing
  between a name and a URL, so it owes a guarantee rather than a good effort.
*/
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/*
  Long enough for a descriptive Vietnamese product name — the longest in this
  catalogue is 82 characters — and short enough that the address stays
  readable where it is pasted. Cut back to a word boundary rather than through
  one: `...cuc-phe-len-di` reads like a transmission error, `...cuc-phe-len`
  reads like a shortened title.
*/
const MAX_LENGTH = 90;

export function slugify(name: string, fallback: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    // The combining marks NFD just separated out.
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const trimmed = trimToLength(base);

  /*
    A name made entirely of emoji, or of a script this does not transliterate,
    leaves nothing behind. The fallback keeps the row addressable; the caller
    appends a number to it, so the second such product gets `san-pham-2`
    rather than failing to save.
  */
  if (!trimmed) return fallback;

  // Belt and braces. If this ever fails the caller must not quietly write a
  // broken address into the catalogue, which is how the 199 got there.
  if (!SLUG_PATTERN.test(trimmed)) {
    throw new Error(`Không dựng được đường dẫn từ tên: ${JSON.stringify(name)}`);
  }
  return trimmed;
}

function trimToLength(slug: string): string {
  if (slug.length <= MAX_LENGTH) return slug;
  const cut = slug.slice(0, MAX_LENGTH);
  const lastBoundary = cut.lastIndexOf('-');
  // A single word longer than the limit has no boundary to cut back to, so it
  // is cut through; anything else loses its final partial word.
  return (lastBoundary > 0 ? cut.slice(0, lastBoundary) : cut).replace(/-+$/, '');
}

/**
 * The first address in the `base`, `base-2`, `base-3` series that nothing is
 * using yet.
 *
 * Two products may honestly share a name — the same toy in two colours, sold
 * as separate rows — and with the address derived rather than typed, the
 * owner has no field in which to break the tie. So the tie is broken here,
 * and the owner is never shown a conflict they cannot act on.
 *
 * `taken` is asked once, for everything already starting with the base,
 * rather than once per candidate: one query settles a name shared by ten
 * products. The unique index behind it remains the real guarantee — two
 * simultaneous creates can still collide, and that collision is a server
 * error to retry, not a sentence to put in front of a shop owner.
 */
export async function freeSlug(
  base: string,
  taken: (prefix: string) => Promise<string[]>,
): Promise<string> {
  const used = new Set(await taken(base));
  if (!used.has(base)) return base;

  for (let n = 2; n <= 999; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }

  /*
    A thousand products sharing one name is not a case worth a nicer answer
    than this, but it is worth an answer: a timestamp in base 36 cannot
    collide with the numbered series above, so the save still succeeds.
  */
  return `${base}-${Date.now().toString(36)}`;
}
