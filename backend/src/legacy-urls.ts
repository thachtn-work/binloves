import type { NextFunction, Request, Response } from 'express';

/*
  Addresses from the shop's previous site, answered instead of thrown away.

  The old site lived on this same domain, so every address search engines
  indexed for it still arrives here. They were query strings, not paths:

      /product?slug=<product>              → /san-pham/<product>
      /category?collection_slug=<category> → /danh-muc/<category>

  Checked against the rescued production dump before this was written: all 262
  products and all 14 categories kept their slug, so the move renames the path
  and nothing else. There is no mapping table to maintain and no address that
  cannot be translated.

  `collection_slug` is the old site's name for it, but that database had no
  collections table — the value was always a category slug. Sending it to
  /bo-suu-tap would look right and be wrong.

  301 rather than serving both addresses. Two addresses for one page split the
  standing a page has earned between them, and leave the search engine to pick
  which is the real one; a redirect moves that standing to the new address and
  retires the old one. It also ends: once the index has caught up this file
  can be deleted, whereas a second route has to be carried forever and
  remembered by whoever adds the next page type.
*/

// Every slug in the catalogue is lower-case letters, digits and hyphens, and
// many begin or end with one. Anything else is not a slug this shop ever
// issued, so it goes to the home page rather than into a path we build.
const SLUG = /^[a-z0-9-]{1,120}$/;

const MOVED = [
  { from: '/product', param: 'slug', to: '/san-pham' },
  { from: '/category', param: 'collection_slug', to: '/danh-muc' },
];

/*
  Files of the old static build. These are not pages that moved — they do not
  exist in any form now, so 410 says so outright. A crawler drops a 410 far
  sooner than a 404, which it reads as "missing today, worth asking again".
*/
const GONE = [
  /^\/(style|category|product-detail)\.css$/,
  /^\/scripts\//,
  /^\/data\//,
  /^\/assets\/images\//,
];

export function legacyUrls(req: Request, res: Response, next: NextFunction) {
  // Both /product and /product/ are in the logs; the old site answered either.
  const path = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;

  for (const rule of MOVED) {
    if (path !== rule.from) continue;
    const value = req.query[rule.param];
    const slug = typeof value === 'string' ? value : '';
    // A missing or unrecognisable slug still had a page on the old site: its
    // listing. The home page is the nearest thing to that now.
    const target = SLUG.test(slug) ? `${rule.to}/${slug}` : '/';
    // 301 for a reader, 308 for anything else — same reason as the www
    // redirect in main.ts: a 301 lets a client turn a POST into a GET.
    const permanent = req.method === 'GET' || req.method === 'HEAD' ? 301 : 308;
    return res.redirect(permanent, target);
  }

  if (GONE.some((pattern) => pattern.test(path))) {
    res.type('text/plain; charset=utf-8');
    return res.status(410).send('Tệp này thuộc phiên bản cũ của website và đã được gỡ.\n');
  }

  return next();
}
