import type { APIRoute } from 'astro';
import { getSnapshot } from '../lib/snapshot';
import { priceDisplay } from '../lib/format';
import { searchKey } from '../lib/search';

/*
  The whole catalogue, small enough to hand over once and search in the
  browser from then on.

  262 products come to roughly 18 KB compressed, so a round trip per keystroke
  would cost more than the entire index and still answer slower — and it would
  put the shop's own API in the path of every letter typed. Fetched on the
  first keystroke rather than with the page, so a visitor who never searches
  never pays for it.

  `k` is the text to match against, folded here rather than in the browser:
  the result is identical for every visitor and the snapshot is already cached,
  so doing it per page load would be 262 string rebuilds to reach the same
  answer. Descriptions are left out — they would multiply the index several
  times over for matches a visitor cannot see on the row that is offered.
*/
export const GET: APIRoute = async () => {
  const { products, categories } = await getSnapshot();
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const items = products.map((product) => {
    const category = categoryName.get(product.categoryId ?? '') ?? '';
    const { now, was } = priceDisplay(product);
    return {
      s: product.slug,
      n: product.name,
      k: searchKey(`${product.name} ${category}`),
      c: category,
      p: now,
      w: was,
      t: product.media[0]?.mediaType === 'image' ? product.media[0].url : null,
    };
  });

  return new Response(JSON.stringify(items), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Matches how long the page itself trusts a snapshot, so a product added
      // in the admin shows up in search on the same schedule as everywhere else.
      'cache-control': 'public, max-age=60',
    },
  });
};
