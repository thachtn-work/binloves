/**
 * The address a visitor actually typed, which is not the one this process is
 * handed.
 *
 * The platform's proxy rewrites the host to "localhost" before forwarding, so
 * the request's own origin is a loopback address. `Astro.site` is no help
 * either: the config is read during `astro build`, so whatever SITE_URL holds
 * at runtime never reaches it. Hence the order below — the configured origin
 * first, then the host the proxy says was asked for, and only then the
 * request as received.
 *
 * Shared rather than repeated because three places need it now — canonical
 * tags, robots.txt and the sitemap — and a sitemap that disagreed with the
 * canonical tags about which host this shop lives on would be worse than
 * having no sitemap at all.
 */
export function siteOrigin(request: Request, url: URL): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  return (
    process.env.SITE_URL ?? (forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin)
  );
}
