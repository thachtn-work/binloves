import type { APIRoute } from 'astro';
import { siteOrigin } from '../lib/site';

/*
  Generated rather than kept as a file in `public/`, for one reason: the
  sitemap line has to carry an absolute URL, and this codebase is handed to a
  second shop on a different domain. A static file would have had that domain
  typed into it, and the copy that moved would have pointed every crawler back
  at the shop it came from.
*/
export const GET: APIRoute = ({ request, url }) => {
  const origin = siteOrigin(request, url);

  const body = `User-agent: *
Allow: /

# Behind a login, and nothing in it is for a reader.
Disallow: /admin

# Search results are this catalogue rearranged, not pages of their own. Left
# crawlable they would compete with the category pages for the same words and
# spend the crawl budget on duplicates.
Disallow: /tim-kiem

Sitemap: ${origin}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
