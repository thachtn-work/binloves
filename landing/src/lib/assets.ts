/**
 * Cache-busting version for the fixed-name files in `public/`.
 *
 * Everything Astro emits into `/assets/` carries a content hash, so it can be
 * cached forever and still update. These files cannot: a favicon lives at a
 * name the browser chooses, and the CDN in front of the site caches static
 * extensions on its own schedule regardless of what the origin says — which
 * once left a 404 pinned in front of a file that existed.
 *
 * Bump this whenever the artwork changes. Keeping it in one place is the
 * point: versioning the logo but not the favicon would leave the two out of
 * step with no visible sign of it.
 */
export const ASSET_VERSION = 3;

export const asset = (path: string) => `${path}?v=${ASSET_VERSION}`;
