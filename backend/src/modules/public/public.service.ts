import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';

const toNumber = (value: Decimal | null) => (value === null ? null : Number(value));

/**
 * A sale price only reaches the site while its window is open.
 *
 * Resolved here rather than on the landing for the same reason the category
 * cover fallback is: it is a content rule, and the landing is a static build
 * that cannot re-evaluate anything after it ships. `hasDiscount` on the other
 * side keeps working untouched — an expired sale simply arrives as no sale.
 *
 * No window at all means the sale runs until the owner removes it, which is
 * how every sale behaved before the window existed.
 */
const saleIsLive = (
  p: { saleStartsAt: Date | null; saleEndsAt: Date | null },
  now: Date,
): boolean =>
  (p.saleStartsAt === null || p.saleStartsAt <= now) &&
  (p.saleEndsAt === null || p.saleEndsAt > now);

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  // One snapshot, fetched once at build time by the Astro landing. Deliberately
  // not split into per-page endpoints: the whole site is generated in a single
  // build pass, so a single round trip avoids the request waterfall that made
  // bin-loves' homepage slow (it fetched each collection's products in a
  // sequential loop). Fine at this catalog size; if the catalog ever grows to
  // thousands of products, split this by entity and paginate.
  async getSnapshot() {
    const [categories, collections, products, banners, contactChannels, siteSettings] =
      await Promise.all([
        this.prisma.category.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, slug: true, name: true, cover: { select: { url: true } } },
        }),
        this.prisma.collection.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            slug: true,
            name: true,
            description: true,
            cover: { select: { url: true } },
            products: {
              where: { product: { isActive: true } },
              orderBy: { sortOrder: 'asc' },
              select: { productId: true },
            },
          },
        }),
        this.prisma.product.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            slug: true,
            name: true,
            description: true,
            price: true,
            salePrice: true,
            saleStartsAt: true,
            saleEndsAt: true,
            stockLabel: true,
            categoryId: true,
            option1Name: true,
            option2Name: true,
            optionImageGroup: true,
            optionImages: { select: { value: true, media: { select: { url: true } } } },
            media: {
              orderBy: { sortOrder: 'asc' },
              select: { media: { select: { url: true, mediaType: true, displayRatio: true } } },
            },
            // Hidden rows are left out here rather than published and filtered
            // in the templates: a combination the owner has unticked is not
            // for sale, so it should not reach the price range either.
            variants: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              select: {
                option1Value: true,
                option2Value: true,
                price: true,
                salePrice: true,
                stockLabel: true,
              },
            },
          },
        }),
        this.prisma.banner.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            title: true,
            linkUrl: true,
            media: { select: { url: true, mediaType: true, displayRatio: true } },
          },
        }),
        this.prisma.contactChannel.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, type: true, label: true, value: true },
        }),
        this.prisma.siteSettings.findUnique({ where: { id: 1 } }),
      ]);

    // One `now` for the whole snapshot, so a sale cannot be live for the home
    // page and expired for the product page of the same build.
    const now = new Date();

    // `mediaType` travels with every URL rather than being inferred from the
    // file extension at render time: the extension is whatever the owner's
    // phone produced, and a mis-guess renders a video as a broken image.
    const mappedProducts = products.map(({ saleStartsAt, saleEndsAt, ...p }) => {
      // One window for the product, applied to its own sale price and to every
      // variant's. The alternative — a window per row — would have the owner
      // pick the same two dates once per combination, and the first time they
      // disagreed the page would show two prices from two different sales.
      const live = saleIsLive({ saleStartsAt, saleEndsAt }, now);
      return {
        ...p,
        price: toNumber(p.price),
        // The window itself is not published: the site has no use for dates it
        // cannot re-check, and shipping them would invite a second, divergent
        // copy of this rule in the templates.
        salePrice: live ? toNumber(p.salePrice) : null,
        media: p.media.map((m) => ({
          url: m.media.url,
          mediaType: m.media.mediaType,
          displayRatio: m.media.displayRatio,
        })),
        // Flattened to the URL alone: the file is already in `media` above, and
        // the site only ever asks "which picture is this colour" — matching on
        // the URL is what lets it move that picture to the front of the gallery.
        optionImages: p.optionImages.map((i) => ({ value: i.value, url: i.media.url })),
        variants: p.variants.map((v) => ({
          ...v,
          price: toNumber(v.price),
          salePrice: live ? toNumber(v.salePrice) : null,
        })),
      };
    });

    // A category or collection the owner hasn't given a photo borrows one, so
    // a new one is never a hole in the homepage row. "First" is the owner's
    // own order — the one they drag into place — and a product with nothing
    // but a clip is skipped rather than blocking its group, since these render
    // as still circles.
    const firstPhotoOf = (p: (typeof mappedProducts)[number]) =>
      p.media.find((m) => m.mediaType === 'image')?.url;

    const categoryCover = new Map<string, string>();
    for (const product of mappedProducts) {
      if (!product.categoryId || categoryCover.has(product.categoryId)) continue;
      const photo = firstPhotoOf(product);
      if (photo) categoryCover.set(product.categoryId, photo);
    }

    // Collections pick from their own membership order rather than the global
    // product order, because that is the order the collection is displayed in.
    const productById = new Map(mappedProducts.map((p) => [p.id, p]));
    const collectionCover = new Map<string, string>();
    for (const collection of collections) {
      for (const { productId } of collection.products) {
        const photo = productById.get(productId) && firstPhotoOf(productById.get(productId)!);
        if (photo) {
          collectionCover.set(collection.id, photo);
          break;
        }
      }
    }

    return {
      categories: categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        // Resolved here, once, rather than in each page that draws a category:
        // the fallback is a content rule, not a rendering detail.
        coverUrl: c.cover?.url ?? categoryCover.get(c.id) ?? null,
      })),
      collections: collections.map(({ cover, products, ...c }) => ({
        ...c,
        coverUrl: cover?.url ?? collectionCover.get(c.id) ?? null,
        productIds: products.map((p) => p.productId),
      })),
      products: mappedProducts,
      banners: banners.map((b) => ({
        id: b.id,
        title: b.title,
        linkUrl: b.linkUrl,
        media: { url: b.media.url, mediaType: b.media.mediaType },
      })),
      contactChannels,
      siteSettings: {
        shopName: siteSettings?.shopName ?? null,
        tagline: siteSettings?.tagline ?? null,
        intro: siteSettings?.intro ?? null,
        seoDescription: siteSettings?.seoDescription ?? null,
        address: siteSettings?.address ?? null,
        businessHours: siteSettings?.businessHours ?? null,
      },
    };
  }
}
