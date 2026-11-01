import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from 'axios';
import type {
  Banner,
  Category,
  Collection,
  ContactChannel,
  Media,
  Product,
  ProductOptionImage,
  ProductVariant,
  SiteSettings,
} from '../lib/types';

/**
 * Serves the whole admin from memory so the UI can be reviewed without a
 * backend: no API to host, no database, nothing exposed to the internet.
 * Edits persist for the session and reset on reload — enough to click through
 * every screen and form.
 *
 * Enabled only when VITE_DEMO_MODE=true at build time, so production builds
 * never carry it.
 */

// Set at build time so the same demo build can carry whichever shop name it
// is being shown under, without this file naming a specific client.
const SHOP_NAME = import.meta.env.VITE_DEMO_SHOP_NAME ?? 'Cửa hàng demo';

const img = (seed: string, w = 800, h = 800) => `https://picsum.photos/seed/${seed}/${w}/${h}`;
const uid = () => Math.random().toString(36).slice(2, 10);

/** Mirrors the API's replace-not-merge contract: rows arrive in their order. */
const mapVariants = (rows: any[] | undefined, productId: string): ProductVariant[] =>
  (rows ?? []).map((row, index) => ({
    id: uid(),
    productId,
    option1Value: row.option1Value,
    option2Value: row.option2Value ?? null,
    price: row.price != null ? String(row.price) : null,
    salePrice: row.salePrice != null ? String(row.salePrice) : null,
    stockLabel: row.stockLabel ?? null,
    isActive: row.isActive ?? true,
    sortOrder: index,
  }));

/** The API answers with the file attached; the form only ever sends its id. */
const mapOptionImages = (
  rows: { value: string; mediaId: string }[] | undefined,
  productId: string,
  media: Media[],
): ProductOptionImage[] =>
  (rows ?? []).flatMap((row) => {
    const file = media.find((m) => m.id === row.mediaId);
    return file ? [{ productId, value: row.value, mediaId: row.mediaId, media: file }] : [];
  });

interface Db {
  categories: Category[];
  products: Product[];
  collections: Collection[];
  banners: Banner[];
  channels: ContactChannel[];
  media: Media[];
  settings: SiteSettings;
}

function seed(): Db {
  const media: Media[] = [];
  const mk = (seedName: string, filename: string, w?: number, h?: number) => {
    const m: Media = {
      id: uid(),
      key: `demo/${filename}`,
      url: img(seedName, w, h),
      mediaType: 'image',
    displayRatio: null,
      filename,
      createdAt: new Date(2026, 9, 1 + (media.length % 20)).toISOString(),
    };
    media.push(m);
    return m;
  };

  // Left without a cover on purpose: the demo should show what the shop owner
  // sees before they pick one, which is the site borrowing a product photo.
  const categories: Category[] = Array.from({ length: 5 }, (_, i) => ({
    id: uid(),
    name: `Danh mục ${i + 1}`,
    slug: `danh-muc-${i + 1}`,
    isActive: true,
    sortOrder: i + 1,
    coverMediaId: null,
  }));

  const stockLabels = ['Còn hàng', 'Còn 2 sản phẩm', 'Sắp hết', 'Còn 5 sản phẩm', null];

  const products: Product[] = Array.from({ length: 24 }, (_, index) => {
    const i = index + 1;
    const price = 150000 + i * 70000;
    const onSale = i % 3 === 0;
    const category = categories[i % categories.length];
    const images = Array.from({ length: (i % 3) + 1 }, (_, k) =>
      mk(`sp${i}-${k}`, `san-pham-${i}-${k}.jpg`),
    );

    // Every fifth product sells by volume, so the demo shows both shapes at
    // once: a price range on the cards and a single price everywhere else.
    const id = uid();
    const varied = i % 5 === 0;
    const volumes = ['10ml', '30ml', '50ml'];

    return {
      id,
      name: `Sản phẩm ${i}`,
      slug: `san-pham-${i}`,
      description:
        `Mô tả ngắn cho sản phẩm ${i}. Đây là nội dung mẫu để xem bố cục.\n` +
        'Chất liệu an toàn, dễ vệ sinh sau khi sử dụng.\n' +
        'Giao hàng trong hộp trơn, không in tên hay hình sản phẩm bên ngoài.',
      price: String(price),
      salePrice: onSale ? String(Math.round((price * 0.78) / 1000) * 1000) : null,
      // Spread across the three states a window can be in, so the demo shows
      // what a scheduled and an expired sale look like rather than only a
      // running one.
      saleStartsAt: onSale && i % 9 === 4 ? new Date(Date.now() + 2 * 864e5).toISOString() : null,
      saleEndsAt:
        onSale && i % 9 === 4
          ? new Date(Date.now() + 9 * 864e5).toISOString()
          : onSale && i % 9 === 7
            ? new Date(Date.now() - 864e5).toISOString()
            : null,
      stockLabel: stockLabels[i % stockLabels.length],
      isActive: i !== 7 && i !== 18,
      sortOrder: i,
      categoryId: category.id,
      category,
      option1Name: varied ? 'Dung tích' : null,
      option2Name: null,
      // Every varied product also demonstrates a photo per value, so the demo
      // shows the swatches on the chips rather than only the price range.
      optionImageGroup: varied ? 1 : null,
      optionImages: varied
        ? volumes.map((volume, k) => ({
            productId: id,
            value: volume,
            mediaId: images[k % images.length].id,
            media: images[k % images.length],
          }))
        : [],
      variants: varied
        ? volumes.map((volume, k) => ({
            id: uid(),
            productId: id,
            option1Value: volume,
            option2Value: null,
            price: String(price + k * 120000),
            salePrice: onSale && k === 1 ? String(Math.round((price * 0.78) / 1000) * 1000) : null,
            stockLabel: null,
            isActive: true,
            sortOrder: k,
          }))
        : [],
      media: images.map((m, order) => ({
        productId: '',
        mediaId: m.id,
        sortOrder: order,
        media: m,
      })),
    };
  });

  const active = products.filter((p) => p.isActive);
  const collections: Collection[] = [
    { name: 'Bộ sưu tập 1', slug: 'bo-suu-tap-1', description: 'Khu vực sản phẩm nổi bật đầu trang chủ.', take: 8 },
    { name: 'Bộ sưu tập 2', slug: 'bo-suu-tap-2', description: 'Nhóm sản phẩm thứ hai trên trang chủ.', take: 6 },
    { name: 'Bộ sưu tập 3', slug: 'bo-suu-tap-3', description: null, take: 5 },
  ].map((spec, index) => {
    const chosen = active.slice(index * 4, index * 4 + spec.take);
    return {
      id: uid(),
      name: spec.name,
      slug: spec.slug,
      description: spec.description,
      isActive: true,
      sortOrder: index + 1,
      // Left empty so the demo shows the site borrowing a product photo,
      // which is what the owner sees before they pick one.
      coverMediaId: null,
      _count: { products: chosen.length },
      products: chosen.map((p, order) => ({ productId: p.id, sortOrder: order, product: p })),
    };
  });

  const banners: Banner[] = Array.from({ length: 3 }, (_, i) => {
    const m = mk(`banner${i + 1}`, `banner-${i + 1}.jpg`, 1200, 800);
    return {
      id: uid(),
      title: `Banner ${i + 1}`,
      linkUrl: null,
      mediaId: m.id,
      media: m,
      isActive: true,
      sortOrder: i + 1,
    };
  });

  const channels: ContactChannel[] = [
    { type: 'zalo', label: 'Zalo cửa hàng', value: '0901234567' },
    { type: 'phone', label: 'Hotline', value: '0987654321' },
    { type: 'messenger', label: 'Messenger', value: 'cuahangdemo' },
    { type: 'facebook', label: 'Facebook', value: 'https://facebook.com/cuahangdemo' },
  ].map((c, i) => ({ id: uid(), ...c, isActive: true, sortOrder: i }));

  return {
    categories,
    products,
    collections,
    banners,
    channels,
    media,
    settings: {
      shopName: SHOP_NAME,
      tagline: 'Chọn thoải mái, nhắn tin riêng, giao hàng kín đáo.',
      intro:
        `${SHOP_NAME} chọn lọc sản phẩm chính hãng, tư vấn riêng tư và giao hàng kín đáo ` +
        'trên toàn quốc, để bạn mua sắm thoải mái mà không phải bận tâm điều gì.',
      seoDescription: `${SHOP_NAME} — tư vấn riêng tư qua Zalo, giao hàng kín đáo toàn quốc.`,
      address: '123 Đường Demo, Quận 1, TP.HCM',
      businessHours: '9:00 - 21:00, Thứ 2 - Chủ nhật',
    },
  };
}

const db = seed();

// Pretend a publish finished a moment ago, so the dashboard's status panel
// shows a realistic "last updated" line instead of an error.
let lastBuildAt = new Date(Date.now() - 4 * 60 * 1000).toISOString();

const ok = (config: AxiosRequestConfig, data: unknown, status = 200): AxiosResponse => ({
  data,
  status,
  statusText: 'OK',
  headers: {},
  config: config as never,
});

const fail = (status: number, message: string) =>
  Promise.reject(
    Object.assign(new Error(message), {
      isAxiosError: true,
      response: { status, data: { message } },
    }),
  );

const body = <T>(config: AxiosRequestConfig): T =>
  typeof config.data === 'string' ? JSON.parse(config.data) : ((config.data ?? {}) as T);

const findOr404 = <T extends { id: string }>(list: T[], id: string) =>
  list.find((item) => item.id === id);

function attachMedia(mediaIds: string[] | undefined) {
  if (!mediaIds) return undefined;
  return mediaIds
    .map((mediaId, order) => {
      const media = db.media.find((m) => m.id === mediaId);
      return media ? { productId: '', mediaId, sortOrder: order, media } : null;
    })
    .filter(Boolean) as Product['media'];
}

export const mockAdapter: AxiosAdapter = async (config) => {
  const method = (config.method ?? 'get').toLowerCase();
  const url = (config.url ?? '').replace(/^\/+/, '');
  const [resource, a, b] = url.split('?')[0].split('/');

  // A touch of latency so loading states are visible rather than instant.
  await new Promise((r) => setTimeout(r, 120));

  if (resource === 'auth') {
    if (a === 'login') return ok(config, { accessToken: 'demo-token', user: DEMO_USER }, 201);
    if (a === 'me') return ok(config, DEMO_USER);
    if (a === 'password') return ok(config, null, 204);
  }

  if (resource === 'site-settings') {
    if (method === 'get') return ok(config, db.settings);
    Object.assign(db.settings, body<SiteSettings>(config));
    lastBuildAt = new Date().toISOString();
    return ok(config, db.settings);
  }

  if (resource === 'publish') {
    if (a === 'status') {
      return ok(config, {
        reachable: true,
        isBuilding: false,
        lastBuild: { at: lastBuildAt, finishedAt: lastBuildAt, status: 'success' },
      });
    }
    lastBuildAt = new Date().toISOString();
    return ok(config, { reachable: true, isBuilding: false });
  }

  if (resource === 'media') {
    if (a === 'presign') {
      const files = body<{ files: { filename: string; contentType: string }[] }>(config).files;
      return ok(
        config,
        files.map((f) => ({
          uploadUrl: 'https://example.invalid/demo-upload',
          key: `demo/${uid()}`,
          publicUrl: img(uid()),
          mediaType: 'image',
    displayRatio: null,
          filename: f.filename,
        })),
      );
    }
    if (a === 'confirm') {
      const files = body<{ files: { key: string; filename: string }[] }>(config).files;
      const created = files.map((f) => {
        const m: Media = {
          id: uid(),
          key: f.key,
          url: img(uid()),
          mediaType: 'image',
    displayRatio: null,
          filename: f.filename,
          createdAt: new Date().toISOString(),
        };
        db.media.unshift(m);
        return m;
      });
      return ok(config, created, 201);
    }
    if (b === 'usages') {
      const products = db.products
        .filter((p) => p.media.some((m) => m.mediaId === a))
        .map((p) => ({ id: p.id, name: p.name }));
      const banners = db.banners
        .filter((bn) => bn.mediaId === a)
        .map((bn) => ({ id: bn.id, title: bn.title }));
      const categories = db.categories
        .filter((c) => c.coverMediaId === a)
        .map((c) => ({ id: c.id, name: c.name }));
      const collections = db.collections
        .filter((c) => c.coverMediaId === a)
        .map((c) => ({ id: c.id, name: c.name }));
      return ok(config, { products, banners, categories, collections });
    }
    if (method === 'get') return ok(config, db.media);
    if (method === 'delete') {
      const inUse =
        db.products.some((p) => p.media.some((m) => m.mediaId === a)) ||
        db.banners.some((bn) => bn.mediaId === a);
      if (inUse) return fail(400, 'Tệp đang được dùng, vui lòng gỡ khỏi các mục trước khi xoá.');
      db.media = db.media.filter((m) => m.id !== a);
      return ok(config, null, 204);
    }
  }

  if (a === 'reorder' && ['categories', 'collections', 'contact-channels'].includes(resource)) {
    const ids = body<{ ids: string[] }>(config).ids;
    const list =
      resource === 'categories'
        ? db.categories
        : resource === 'collections'
          ? db.collections
          : db.channels;
    const byId = new Map(list.map((item) => [item.id, item]));
    const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as typeof list;
    reordered.forEach((item, index) => {
      (item as { sortOrder: number }).sortOrder = index;
    });
    if (resource === 'categories') db.categories = reordered as Category[];
    else if (resource === 'collections') db.collections = reordered as Collection[];
    else db.channels = reordered as ContactChannel[];
    lastBuildAt = new Date().toISOString();
    return ok(config, reordered);
  }

  if (resource === 'categories') return crud(config, method, a, db.categories, (dto) => ({
    id: uid(),
    name: dto.name,
    slug: dto.slug,
    isActive: dto.isActive ?? true,
    sortOrder: dto.sortOrder ?? 0,
    coverMediaId: dto.coverMediaId ?? null,
  }));

  if (resource === 'contact-channels') return crud(config, method, a, db.channels, (dto) => ({
    id: uid(),
    type: dto.type,
    label: dto.label ?? null,
    value: dto.value,
    isActive: dto.isActive ?? true,
    sortOrder: dto.sortOrder ?? 0,
  }));

  if (resource === 'banners') {
    if (method === 'post') {
      const dto = body<any>(config);
      const media = db.media.find((m) => m.id === dto.mediaId);
      if (!media) return fail(400, 'Không tìm thấy tệp đã chọn cho banner');
      const banner: Banner = {
        id: uid(),
        title: dto.title ?? null,
        linkUrl: dto.linkUrl ?? null,
        mediaId: dto.mediaId,
        media,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      };
      db.banners.push(banner);
      lastBuildAt = new Date().toISOString();
      return ok(config, banner, 201);
    }
    return crud(config, method, a, db.banners, () => ({}) as Banner);
  }

  if (resource === 'products') {
    if (method === 'get' && a) {
      const found = findOr404(db.products, a);
      return found ? ok(config, found) : fail(404, 'Không tìm thấy sản phẩm');
    }
    if (method === 'get') return ok(config, db.products);
    if (method === 'post') {
      const dto = body<any>(config);
      const id = uid();
      const product: Product = {
        id,
        name: dto.name,
        slug: dto.slug,
        description: dto.description ?? null,
        price: dto.price != null ? String(dto.price) : null,
        salePrice: dto.salePrice != null ? String(dto.salePrice) : null,
        saleStartsAt: dto.saleStartsAt ?? null,
        saleEndsAt: dto.saleEndsAt ?? null,
        stockLabel: dto.stockLabel ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        categoryId: dto.categoryId ?? null,
        category: db.categories.find((c) => c.id === dto.categoryId) ?? null,
        option1Name: dto.option1Name ?? null,
        option2Name: dto.option2Name ?? null,
        variants: mapVariants(dto.variants, id),
        optionImageGroup: dto.optionImageGroup ?? null,
        optionImages: mapOptionImages(dto.optionImages, id, db.media),
        media: attachMedia(dto.mediaIds) ?? [],
      };
      db.products.unshift(product);
      lastBuildAt = new Date().toISOString();
      return ok(config, product, 201);
    }
    if (method === 'patch') {
      const product = findOr404(db.products, a);
      if (!product) return fail(404, 'Không tìm thấy sản phẩm');
      const dto = body<any>(config);
      Object.assign(product, {
        ...dto,
        price: dto.price != null ? String(dto.price) : product.price,
        salePrice: dto.salePrice != null ? String(dto.salePrice) : null,
        variants: dto.variants ? mapVariants(dto.variants, product.id) : product.variants,
        optionImages: dto.optionImages
          ? mapOptionImages(dto.optionImages, product.id, db.media)
          : product.optionImages,
        category: dto.categoryId
          ? (db.categories.find((c) => c.id === dto.categoryId) ?? null)
          : product.category,
        media: attachMedia(dto.mediaIds) ?? product.media,
      });
      lastBuildAt = new Date().toISOString();
      return ok(config, product);
    }
    if (method === 'delete') {
      db.products = db.products.filter((p) => p.id !== a);
      lastBuildAt = new Date().toISOString();
      return ok(config, null, 204);
    }
  }

  if (resource === 'collections') {
    if (b === 'products' && method === 'put') {
      const collection = findOr404(db.collections, a);
      if (!collection) return fail(404, 'Không tìm thấy bộ sưu tập');
      const ids = body<{ productIds: string[] }>(config).productIds;
      collection.products = ids
        .map((pid, order) => {
          const product = db.products.find((p) => p.id === pid);
          return product ? { productId: pid, sortOrder: order, product } : null;
        })
        .filter(Boolean) as Collection['products'];
      collection._count = { products: collection.products!.length };
      lastBuildAt = new Date().toISOString();
      return ok(config, collection);
    }
    if (method === 'get' && a) {
      const found = findOr404(db.collections, a);
      return found ? ok(config, found) : fail(404, 'Không tìm thấy bộ sưu tập');
    }
    if (method === 'get') return ok(config, db.collections);
    if (method === 'post') {
      const dto = body<any>(config);
      const collection: Collection = {
        id: uid(),
        name: dto.name,
        slug: dto.slug,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        coverMediaId: dto.coverMediaId ?? null,
        _count: { products: 0 },
        products: [],
      };
      db.collections.push(collection);
      lastBuildAt = new Date().toISOString();
      return ok(config, collection, 201);
    }
    return crud(config, method, a, db.collections, () => ({}) as Collection);
  }

  return fail(404, `Demo không hỗ trợ đường dẫn: ${url}`);
};

function crud<T extends { id: string }>(
  config: AxiosRequestConfig,
  method: string,
  id: string | undefined,
  list: T[],
  create: (dto: any) => T,
): Promise<AxiosResponse> {
  if (method === 'get' && id) {
    const found = list.find((item) => item.id === id);
    return found ? Promise.resolve(ok(config, found)) : fail(404, 'Không tìm thấy dữ liệu');
  }
  if (method === 'get') return Promise.resolve(ok(config, list));
  if (method === 'post') {
    const created = create(body<any>(config));
    list.push(created);
    lastBuildAt = new Date().toISOString();
    return Promise.resolve(ok(config, created, 201));
  }
  if (method === 'patch') {
    const found = list.find((item) => item.id === id);
    if (!found) return fail(404, 'Không tìm thấy dữ liệu');
    Object.assign(found, body<Partial<T>>(config));
    lastBuildAt = new Date().toISOString();
    return Promise.resolve(ok(config, found));
  }
  if (method === 'delete') {
    const index = list.findIndex((item) => item.id === id);
    if (index >= 0) list.splice(index, 1);
    lastBuildAt = new Date().toISOString();
    return Promise.resolve(ok(config, null, 204));
  }
  return fail(405, 'Phương thức không được hỗ trợ trong bản demo');
}

export const DEMO_USER = { id: 'demo-user', email: 'owner@example.com' };
export const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';
