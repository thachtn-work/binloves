/*
  Asking the image host for the size the page actually needs.

  The shop's photos are stored at whatever size they were uploaded at —
  roughly 145 KB each — and a product card on a phone is 165px wide. Handing
  the full file to a card that small is most of the page's weight spent on
  pixels nobody can see: the homepage pulls 4.8 MB of images on a phone, and
  the category circles alone account for a third of it at 70px across.

  Cloudflare resizes on its own edge for any image served from a hostname on
  the same zone, which the media domain is. Nothing is pre-generated and
  nothing is stored twice — the first request for a size produces it, the rest
  are cache hits.

  Off unless IMAGE_TRANSFORM is set, and deliberately so: the feature has to be
  switched on for the zone in the Cloudflare dashboard first, and until it is,
  these URLs 404. That would not degrade the page, it would empty it — so the
  switch belongs next to the thing it depends on, not on by assumption.
*/
const ON = (import.meta.env.IMAGE_TRANSFORM ?? process.env.IMAGE_TRANSFORM ?? '') !== '';

/*
  Quality 80 is where these photos stop losing anything visible.

  `onerror=redirect` is the part that matters most. The free allowance counts
  distinct image-and-size pairs per month, not requests — a photo resized once
  serves every visitor after that from cache — and this catalogue's ceiling is
  about 2,900 against an allowance of 5,000. But "about" is doing work there:
  the shop keeps adding products, and an image the resizer cannot handle has
  always been possible. Without this, either case answers 404 and the page
  loses the picture entirely; with it, the visitor is handed the original
  file. Slower than it should be, which is the right way to fail.
*/
const OPTIONS = 'format=auto,quality=80,fit=scale-down,onerror=redirect';

export function sized(url: string, width: number): string {
  if (!ON || !url) return url;
  try {
    return `${new URL(url).origin}/cdn-cgi/image/width=${width},${OPTIONS}/${url}`;
  } catch {
    // A relative or malformed URL is left exactly as it was; a broken image is
    // a worse outcome than an unoptimised one.
    return url;
  }
}

/**
 * One entry at the layout width and one at twice it. Two steps rather than a
 * ladder of five because every distinct width is a transformation counted
 * against the monthly allowance, and a phone at 3x is better served a 2x file
 * than another 300 KB.
 */
export function srcSet(url: string, width: number): string | undefined {
  if (!ON || !url) return undefined;
  return `${sized(url, width)} ${width}w, ${sized(url, width * 2)} ${width * 2}w`;
}
