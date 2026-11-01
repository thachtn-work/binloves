import type { APIRoute } from 'astro';
import { getSnapshot } from '../lib/snapshot';
import { siteOrigin } from '../lib/site';

/*
  Built from the same snapshot the pages are rendered from, so it lists what
  the shop is actually showing today. A product the owner hides stops being in
  the snapshot and stops being in here on the next request — no build step to
  remember, nothing to fall out of date.

  No <lastmod>, <changefreq> or <priority>. The snapshot carries no
  modification time, and the honest alternatives are inventing one or printing
  today's date on all 290 URLs — which tells a crawler the whole catalogue
  changed every time it looks, and is worse than saying nothing. The other two
  are hints Google has said it ignores.
*/
const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async ({ request, url }) => {
  const origin = siteOrigin(request, url);
  const { categories, collections, products } = await getSnapshot();

  const paths = [
    '/',
    ...categories.map((c) => `/danh-muc/${encodeURIComponent(c.slug)}`),
    ...collections.map((c) => `/bo-suu-tap/${encodeURIComponent(c.slug)}`),
    ...products.map((p) => `/san-pham/${encodeURIComponent(p.slug)}`),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `  <url><loc>${escape(new URL(path, origin).href)}</loc></url>`).join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // The same minute the pages themselves trust a snapshot for.
      'cache-control': 'public, max-age=60',
    },
  });
};
