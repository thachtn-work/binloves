/**
 * The shop uploads photos and short clips through the same picker, so every
 * place that renders one has to ask which it is. The type is recorded at
 * upload time and carried here; never guess it from the URL.
 */
export type MediaKind = 'image' | 'video';

export interface MediaItem {
  url: string;
  mediaType: MediaKind;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  /**
   * Already resolved by the API: the owner's own choice, or failing that the
   * first photo of the first product inside. Null only when the category is
   * empty or holds nothing but clips — render a placeholder, don't re-derive
   * the fallback here.
   */
  coverUrl: string | null;
}

export interface Collection {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /**
   * Already resolved by the API: the owner's own choice, or failing that the
   * first photo of the first product in the collection. Null only when the
   * collection is empty or holds nothing but clips.
   */
  coverUrl: string | null;
  productIds: string[];
}

/**
 * One sellable combination of the product's option groups.
 *
 * `salePrice` arrives already resolved against the product's sale window — the
 * API sends null once the window has passed — so nothing here has to know what
 * day it is.
 */
export interface Variant {
  option1Value: string;
  option2Value: string | null;
  price: number | null;
  salePrice: number | null;
  stockLabel: string | null;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number | null;
  salePrice: number | null;
  stockLabel: string | null;
  categoryId: string | null;
  /** What the owner calls each axis — "Dung tích", "Màu". Null when unused. */
  option1Name: string | null;
  option2Name: string | null;
  /** Empty for a product sold at one price, which is most of them. */
  variants: Variant[];
  media: MediaItem[];
  /**
   * Which option group's values have a photo of their own — 1, 2 or null.
   * Only ever one of them: two photos for one choice have no frame to share.
   */
  optionImageGroup: number | null;
  /**
   * The photo standing for each value of that group. The url is always one
   * already in `media`, so picking a value moves a picture the page is holding
   * rather than fetching a new one.
   */
  optionImages: { value: string; url: string }[];
}

export interface Banner {
  id: string;
  title: string | null;
  linkUrl: string | null;
  media: MediaItem;
}

export interface ContactChannel {
  id: string;
  type: string;
  label: string | null;
  value: string;
}

export interface SiteSettings {
  shopName: string | null;
  tagline: string | null;
  /** A few sentences about the shop, shown in the corner of the home hero. */
  intro: string | null;
  seoDescription: string | null;
  address: string | null;
  businessHours: string | null;
}

export interface Snapshot {
  categories: Category[];
  collections: Collection[];
  products: Product[];
  banners: Banner[];
  contactChannels: ContactChannel[];
  siteSettings: SiteSettings;
}

/**
 * The API runs in the same process, so the default talks to the loopback port
 * the server is already listening on rather than to a separate host.
 */
const API_URL =
  process.env.API_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}/api/v1`;

const TTL_MS = Number(process.env.SNAPSHOT_TTL_MS ?? 60_000);

interface Entry {
  at: number;
  value: Promise<Snapshot>;
}

/*
  Held on globalThis, not in a module variable, because the two halves that
  touch it are loaded separately: the Astro bundle reads it on every render,
  and Nest clears it from outside after the owner saves something. Each has
  its own module graph, so a module-level variable would give them a cache
  each and the admin would appear to change nothing.
*/
const g = globalThis as typeof globalThis & {
  __snapshot?: Entry;
  __snapshotLastGood?: Snapshot;
  __clearSnapshot?: () => void;
};

/** Called by the API after a content change, so the next render refetches. */
g.__clearSnapshot = () => {
  g.__snapshot = undefined;
};

/*
  One fetch per TTL, shared by every request that arrives during it — the
  promise is cached, not the result, so twenty simultaneous visitors after an
  expiry cause one API call rather than twenty.

  Never cached in dev, where the server is long-lived and the whole point is
  that an admin edit shows up on the next refresh.
*/
export function getSnapshot(): Promise<Snapshot> {
  if (import.meta.env.DEV) return fetchSnapshot();

  const now = Date.now();
  if (!g.__snapshot || now - g.__snapshot.at > TTL_MS) {
    const entry: Entry = { at: now, value: undefined as unknown as Promise<Snapshot> };
    entry.value = fetchSnapshot().then(
      (snapshot) => {
        g.__snapshotLastGood = snapshot;
        return snapshot;
      },
      (err: unknown) => {
        // Drop the failed entry so the next request retries instead of being
        // stuck with it for the rest of the TTL.
        if (g.__snapshot === entry) g.__snapshot = undefined;
        /*
          Serve the last good copy rather than an error page.

          The site is no longer static, so a blip between this process and its
          own API — a restart, a connection pool exhausted, one slow query —
          now reaches the customer instead of merely failing a build. Catalogue
          data minutes out of date is a far better answer than a 500, and the
          shop loses nothing by it: the next request tries again.
        */
        if (g.__snapshotLastGood) return g.__snapshotLastGood;
        throw err;
      },
    );
    g.__snapshot = entry;
  }

  return g.__snapshot.value;
}

async function fetchSnapshot(): Promise<Snapshot> {
  const res = await fetch(`${API_URL}/public/snapshot`);
  if (!res.ok) {
    throw new Error(`Không tải được dữ liệu từ ${API_URL}/public/snapshot (HTTP ${res.status})`);
  }
  return res.json();
}

export function productsOf(collection: Collection, products: Product[]): Product[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return collection.productIds.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
}

export function productsInCategory(categoryId: string, products: Product[]): Product[] {
  return products.filter((p) => p.categoryId === categoryId);
}
