// Fills an empty shop with placeholder content so the whole site can be
// reviewed with realistic density — useful when showing a client the layout
// before they have written any of their own content.
//
//   npm run seed:demo          add demo content
//   npm run seed:demo -- --reset   wipe everything first (admin account kept)
//
// Images point at picsum.photos and the sample clip at Mozilla's CC0 asset
// repo, so no storage bucket of our own is needed to see the design —
// including how a product and a banner look when the owner uploads video
// rather than a photo. Never run this against a shop with real content.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Overridable so the same seeder can dress a demo for whichever shop it is
// being shown to, without editing this file per client.
const SHOP_NAME = process.env.DEMO_SHOP_NAME || 'Cửa hàng demo';

const CATEGORY_COUNT = 5;
const PRODUCT_COUNT = 24;
const COLLECTIONS = [
  { name: 'Bộ sưu tập 1', slug: 'bo-suu-tap-1', description: 'Khu vực sản phẩm nổi bật đầu trang chủ.', take: 8 },
  { name: 'Bộ sưu tập 2', slug: 'bo-suu-tap-2', description: 'Nhóm sản phẩm thứ hai trên trang chủ.', take: 6 },
  { name: 'Bộ sưu tập 3', slug: 'bo-suu-tap-3', description: null, take: 5 },
];

const img = (seed, w = 800, h = 800) => `https://picsum.photos/seed/${seed}/${w}/${h}`;
// Overridable the same way the shop name is — point it at a file you are
// serving locally to review video behaviour without reaching the internet.
const SAMPLE_CLIP =
  process.env.DEMO_CLIP_URL ||
  'https://mdn.github.io/shared-assets/videos/flower.mp4';

// Deterministic pseudo-randomness: the same demo data every run, so repeated
// screenshots stay comparable.
const pick = (n, options) => options[n % options.length];

const clipMedia = (tag) =>
  prisma.media.create({
    data: {
      key: `demo/clip-${tag}.mp4`,
      url: SAMPLE_CLIP,
      mediaType: 'video',
      filename: `clip-${tag}.mp4`,
    },
  });

async function reset() {
  // Children first — the join tables have no cascade from this direction.
  await prisma.collectionProduct.deleteMany();
  await prisma.productMedia.deleteMany();
  await prisma.banner.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.media.deleteMany();
  await prisma.contactChannel.deleteMany();
  console.log('Cleared existing content (admin account kept).');
}

async function main() {
  if (process.argv.includes('--reset')) await reset();

  await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  await prisma.siteSettings.update({
    where: { id: 1 },
    data: {
      shopName: SHOP_NAME,
      tagline: 'Chọn thoải mái, nhắn tin riêng, giao hàng kín đáo.',
      seoDescription: `${SHOP_NAME} — tư vấn riêng tư qua Zalo, giao hàng kín đáo toàn quốc.`,
      address: '123 Đường Demo, Quận 1, TP.HCM',
      businessHours: '9:00 - 21:00, Thứ 2 - Chủ nhật',
    },
  });

  const categories = [];
  for (let i = 1; i <= CATEGORY_COUNT; i++) {
    categories.push(
      await prisma.category.create({
        data: { name: `Danh mục ${i}`, slug: `danh-muc-${i}`, sortOrder: i },
      }),
    );
  }

  const stockLabels = ['Còn hàng', 'Còn 2 sản phẩm', 'Sắp hết', 'Còn 5 sản phẩm', null];
  const products = [];

  for (let i = 1; i <= PRODUCT_COUNT; i++) {
    const price = 150000 + i * 70000;
    const onSale = i % 3 === 0;
    // Two hidden products so the admin's "đang ẩn" state is visible and the
    // landing can be checked for leaking drafts.
    const isActive = i !== 7 && i !== 18;
    const imageCount = (i % 3) + 1;

    const media = [];

    // Product 1 leads with a clip and product 2 ends with one, so a review
    // covers both the card cover and a gallery that mixes the two kinds.
    if (i === 1) {
      media.push(await clipMedia(i));
    }

    for (let k = 0; k < imageCount; k++) {
      media.push(
        await prisma.media.create({
          data: {
            key: `demo/sp-${i}-${k}.jpg`,
            url: img(`sp${i}-${k}`),
            mediaType: 'image',
            filename: `san-pham-${i}-${k}.jpg`,
          },
        }),
      );
    }

    if (i === 2) {
      media.push(await clipMedia(i));
    }

    products.push(
      await prisma.product.create({
        data: {
          name: `Sản phẩm ${i}`,
          slug: `san-pham-${i}`,
          description: [
            `Mô tả ngắn cho sản phẩm ${i}. Đây là nội dung mẫu để xem bố cục trang chi tiết.`,
            'Chất liệu an toàn, dễ vệ sinh sau khi sử dụng.',
            'Giao hàng trong hộp trơn, không in tên hay hình sản phẩm bên ngoài.',
          ].join('\n'),
          price,
          salePrice: onSale ? Math.round((price * 0.78) / 1000) * 1000 : null,
          stockLabel: pick(i, stockLabels),
          isActive,
          sortOrder: i,
          categoryId: categories[i % categories.length].id,
          media: { create: media.map((m, index) => ({ mediaId: m.id, sortOrder: index })) },
        },
      }),
    );
  }

  const active = products.filter((p) => p.isActive);
  for (const [index, spec] of COLLECTIONS.entries()) {
    const chosen = active.slice(index * 4, index * 4 + spec.take);
    await prisma.collection.create({
      data: {
        name: spec.name,
        slug: spec.slug,
        description: spec.description,
        sortOrder: index + 1,
        products: {
          create: chosen.map((p, order) => ({ productId: p.id, sortOrder: order })),
        },
      },
    });
  }

  for (let i = 1; i <= 3; i++) {
    // The first banner is a clip: an autoplaying hero is the one place video
    // behaves differently enough to be worth seeing before launch.
    const media =
      i === 1
        ? await clipMedia('banner')
        : await prisma.media.create({
            data: {
              key: `demo/banner-${i}.jpg`,
              url: img(`banner${i}`, 1200, 800),
              mediaType: 'image',
              filename: `banner-${i}.jpg`,
            },
          });
    await prisma.banner.create({
      data: { title: `Banner ${i}`, mediaId: media.id, sortOrder: i },
    });
  }

  // zalo, messenger and telegram are the three the floating contact dock draws,
  // so all three are seeded: a demo missing one would show a dock that is not
  // the one the finished shop gets.
  const channels = [
    { type: 'zalo', label: 'Zalo cửa hàng', value: '0901234567' },
    { type: 'messenger', label: 'Messenger', value: 'cuahangdemo' },
    { type: 'telegram', label: 'Telegram', value: '@cuahangdemo' },
    { type: 'phone', label: 'Hotline', value: '0987654321' },
    { type: 'facebook', label: 'Facebook', value: 'https://facebook.com/cuahangdemo' },
  ];
  for (const [index, channel] of channels.entries()) {
    await prisma.contactChannel.create({ data: { ...channel, sortOrder: index } });
  }

  console.log(
    `Demo content ready: ${CATEGORY_COUNT} danh mục, ${PRODUCT_COUNT} sản phẩm ` +
      `(${active.length} đang hiện), ${COLLECTIONS.length} bộ sưu tập, 3 banner, ` +
      `${channels.length} kênh liên hệ.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
