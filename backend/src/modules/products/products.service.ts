import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { CONTENT_CHANGED_EVENT } from '../../common/events/content-changed.event';
import { withUniqueSlug } from '../../common/prisma/unique-slug';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto, ProductVariantDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const PRODUCT_INCLUDE = {
  category: true,
  media: { include: { media: true }, orderBy: { sortOrder: 'asc' } },
  variants: { orderBy: { sortOrder: 'asc' } },
  optionImages: { include: { media: true } },
} satisfies Prisma.ProductInclude;

/** Shapes a submitted row into what the table stores; index is the order. */
const variantRow = (v: ProductVariantDto, index: number) => ({
  option1Value: v.option1Value.trim(),
  option2Value: v.option2Value?.trim() || null,
  price: v.price ?? null,
  salePrice: v.salePrice ?? null,
  stockLabel: v.stockLabel?.trim() || null,
  isActive: v.isActive ?? true,
  sortOrder: index,
});

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  findAll(categoryId?: string) {
    return this.prisma.product.findMany({
      where: categoryId ? { categoryId } : undefined,
      include: PRODUCT_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE });
    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }
    return product;
  }

  async create(dto: CreateProductDto) {
    const { mediaIds, variants, optionImages, ...data } = dto;
    await this.assertMediaExist(mediaIds);
    this.assertVariants(dto);
    this.assertOptionImages(dto);
    this.assertSaleWindow(dto);

    const product = await withUniqueSlug('sản phẩm', () =>
      this.prisma.product.create({
        data: {
          ...data,
          media: mediaIds?.length
            ? { create: mediaIds.map((mediaId, index) => ({ mediaId, sortOrder: index })) }
            : undefined,
          variants: variants?.length ? { create: variants.map(variantRow) } : undefined,
          optionImages: optionImages?.length
            ? { create: optionImages.map((i) => ({ value: i.value.trim(), mediaId: i.mediaId })) }
            : undefined,
        },
        include: PRODUCT_INCLUDE,
      }),
    );

    this.events.emit(CONTENT_CHANGED_EVENT);
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.findOne(id);
    const { mediaIds, variants, optionImages, ...data } = dto;
    await this.assertMediaExist(mediaIds);
    this.assertVariants(dto, existing);
    this.assertOptionImages(dto, existing);
    // Checked against the merged result, not the patch: a PATCH that only
    // clears salePrice would otherwise leave a window pointing at no price.
    this.assertSaleWindow(dto, existing);

    const product = await withUniqueSlug('sản phẩm', () =>
      this.prisma.$transaction(async (tx) => {
        // Replace-not-merge: the admin form always submits the full gallery in
        // its intended order, so wiping and re-creating keeps sortOrder honest
        // without diffing. Only touched when mediaIds is actually provided —
        // a PATCH that omits it leaves the gallery alone.
        if (mediaIds) {
          await tx.productMedia.deleteMany({ where: { productId: id } });
          if (mediaIds.length) {
            await tx.productMedia.createMany({
              data: mediaIds.map((mediaId, index) => ({ productId: id, mediaId, sortOrder: index })),
            });
          }
        }
        // Same replace-not-merge contract as the gallery. Rows carry no
        // identity the rest of the system refers to — nothing links to a
        // variant — so recreating them is cheaper than diffing, and it keeps
        // sortOrder equal to the order the owner left them in.
        if (variants) {
          await tx.productVariant.deleteMany({ where: { productId: id } });
          if (variants.length) {
            await tx.productVariant.createMany({
              data: variants.map((v, index) => ({ productId: id, ...variantRow(v, index) })),
            });
          }
        }
        // Same contract again. Values are free text, so a changed spelling is a
        // different row with no identity to match on — replacing the set is the
        // only reading that cannot leave an image behind on a value that is
        // gone.
        if (optionImages) {
          await tx.productOptionImage.deleteMany({ where: { productId: id } });
          if (optionImages.length) {
            await tx.productOptionImage.createMany({
              data: optionImages.map((i) => ({
                productId: id,
                value: i.value.trim(),
                mediaId: i.mediaId,
              })),
            });
          }
        }
        return tx.product.update({ where: { id }, data, include: PRODUCT_INCLUDE });
      }),
    );

    this.events.emit(CONTENT_CHANGED_EVENT);
    return product;
  }

  /**
   * A sale window has to agree with the price it governs.
   *
   * `existing` is the stored row on an update, so the rules are checked against
   * what the product will actually look like afterwards rather than against
   * whichever fields this particular PATCH happened to carry. `undefined` in
   * the patch means "leave alone"; `null` means "clear".
   */
  private assertSaleWindow(
    dto: CreateProductDto | UpdateProductDto,
    existing?: {
      salePrice: Prisma.Decimal | null;
      saleStartsAt: Date | null;
      saleEndsAt: Date | null;
      variants?: { salePrice: Prisma.Decimal | null }[];
    },
  ) {
    const pick = <T>(patched: T | null | undefined, stored: T | null): T | null =>
      patched === undefined ? stored : patched;

    // Only whether a price exists matters here; Decimal and number never meet.
    // A variant's sale price counts: on a product with option groups the
    // per-row prices are the ones the window governs, and the product's own
    // salePrice is left empty.
    const variants = this.mergedVariants(dto, existing);
    const hasSalePrice =
      (dto.salePrice === undefined ? existing?.salePrice != null : dto.salePrice !== null) ||
      variants.some((v) => v.salePrice != null);
    const startsAt = pick(dto.saleStartsAt, existing?.saleStartsAt?.toISOString() ?? null);
    const endsAt = pick(dto.saleEndsAt, existing?.saleEndsAt?.toISOString() ?? null);

    if ((startsAt || endsAt) && !hasSalePrice) {
      throw new BadRequestException(
        'Đã đặt thời gian khuyến mãi thì phải nhập giá khuyến mãi, nếu không thì khoảng thời gian đó không áp dụng gì cả.',
      );
    }

    if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      throw new BadRequestException('Thời gian kết thúc khuyến mãi phải sau thời gian bắt đầu.');
    }
  }

  /**
   * Moves a product one place within its own category.
   *
   * Everything shipped so far left every product on sortOrder 0, so the order
   * on the site has really been the createdAt tiebreak all along. Swapping two
   * zeroes would do nothing and the arrows would look broken, so the first
   * move writes the order that is already on screen into sortOrder — visibly a
   * no-op — and from then on a move is a straight swap.
   */
  async move(id: string, direction: 'up' | 'down') {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    await this.ensureDistinctOrder();

    const siblings = await this.prisma.product.findMany({
      where: { categoryId: product.categoryId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: { id: true, sortOrder: true },
    });

    const from = siblings.findIndex((p) => p.id === id);
    const to = direction === 'up' ? from - 1 : from + 1;
    // Already at the end of its category: nothing to swap with, and silently
    // doing nothing is the right answer for a button that should be disabled.
    if (from === -1 || to < 0 || to >= siblings.length) return;

    const a = siblings[from];
    const b = siblings[to];
    await this.prisma.$transaction([
      this.prisma.product.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
      this.prisma.product.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
    ]);

    this.events.emit(CONTENT_CHANGED_EVENT);
  }

  /**
   * Rewrites the order of one category's products.
   *
   * It reuses the sortOrder values that category already occupies rather than
   * numbering from zero: a product's sortOrder is global, so renumbering would
   * drag the whole category to the front of every other listing. Redistributed
   * among themselves, the category keeps exactly the slots it had in the global
   * sequence and only swaps who sits in which — every other product stays put,
   * the same guarantee a single arrow press gives.
   */
  async reorderInCategory(categoryId: string, ids: string[]) {
    await this.ensureDistinctOrder();

    const current = await this.prisma.product.findMany({
      where: { categoryId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: { id: true, sortOrder: true },
    });

    const known = new Set(current.map((p) => p.id));
    // Refusing a partial list is the point: writing it would silently drop
    // whichever products the caller forgot to send.
    if (ids.length !== current.length || ids.some((id) => !known.has(id))) {
      throw new BadRequestException(
        'Danh sách thứ tự không khớp với các sản phẩm đang có trong danh mục này.',
      );
    }

    const slots = current.map((p) => p.sortOrder).sort((a, b) => a - b);
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.product.update({ where: { id }, data: { sortOrder: slots[index] } }),
      ),
    );

    this.events.emit(CONTENT_CHANGED_EVENT);
  }

  /**
   * Gives every product a slot of its own, numbered in the order the site is
   * already showing them. Run across the whole table rather than one category,
   * because leaving other categories tied at 0 would let them interleave with
   * the numbers this one just took.
   *
   * Idempotent, and a no-op once the numbers are distinct.
   */
  private async ensureDistinctOrder() {
    const all = await this.prisma.product.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: { id: true, sortOrder: true },
    });
    if (new Set(all.map((p) => p.sortOrder)).size === all.length) return;

    await this.prisma.$transaction(
      all.map((p, index) =>
        this.prisma.product.update({ where: { id: p.id }, data: { sortOrder: index } }),
      ),
    );
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.product.delete({ where: { id } });
    this.events.emit(CONTENT_CHANGED_EVENT);
  }

  /**
   * The variant rows this request leaves behind: the submitted ones, or the
   * stored ones when the patch says nothing about them.
   *
   * Only `salePrice` is read by the callers, so the return type stays narrow
   * enough for both a DTO row (number) and a stored row (Decimal) to satisfy.
   */
  private mergedVariants(
    dto: CreateProductDto | UpdateProductDto,
    existing?: { variants?: { salePrice: Prisma.Decimal | null }[] },
  ): { salePrice?: number | Prisma.Decimal | null }[] {
    return dto.variants ?? existing?.variants ?? [];
  }

  /**
   * The option groups and the rows have to describe the same product.
   *
   * Like the sale window, this is checked against what the product will look
   * like after the patch rather than against the fields this request happened
   * to carry — otherwise renaming a group in one PATCH and its rows in the
   * next would each pass while the pair in between is nonsense.
   */
  private assertVariants(
    dto: CreateProductDto | UpdateProductDto,
    existing?: {
      option1Name: string | null;
      option2Name: string | null;
      variants?: { option1Value: string; option2Value: string | null }[];
    },
  ) {
    const pick = (patched: string | null | undefined, stored: string | null | undefined) =>
      (patched === undefined ? (stored ?? null) : patched)?.trim() || null;

    const name1 = pick(dto.option1Name, existing?.option1Name);
    const name2 = pick(dto.option2Name, existing?.option2Name);
    const rows = (dto.variants ?? existing?.variants ?? []).map((v) => ({
      v1: v.option1Value.trim(),
      v2: v.option2Value?.trim() || null,
    }));

    if (rows.length === 0) {
      if (name1 || name2) {
        throw new BadRequestException(
          'Đã đặt tên nhóm phân loại thì phải có ít nhất một phân loại, hoặc bỏ tên nhóm đi.',
        );
      }
      return;
    }

    if (!name1) {
      throw new BadRequestException('Có phân loại thì phải đặt tên cho nhóm thứ nhất.');
    }
    if (name2 && rows.some((r) => !r.v2)) {
      throw new BadRequestException(`Có nhóm "${name2}" thì mọi phân loại đều phải chọn giá trị của nhóm này.`);
    }
    if (!name2 && rows.some((r) => r.v2)) {
      throw new BadRequestException(
        'Có phân loại ghi giá trị của nhóm thứ hai nhưng nhóm thứ hai chưa được đặt tên.',
      );
    }

    const seen = new Set<string>();
    for (const r of rows) {
      const key = `${r.v1}\u0000${r.v2 ?? ''}`;
      if (seen.has(key)) {
        throw new BadRequestException(
          `Phân loại "${[r.v1, r.v2].filter(Boolean).join(' / ')}" bị trùng.`,
        );
      }
      seen.add(key);
    }
  }

  /**
   * The per-value photos have to point at values and files that exist.
   *
   * Checked against the merged state for the same reason the two rules above
   * are: the admin sends the whole product, but a PATCH carrying only
   * `variants` must not be allowed to delete the colour an image still names.
   */
  private assertOptionImages(
    dto: CreateProductDto | UpdateProductDto,
    existing?: {
      option2Name: string | null;
      optionImageGroup: number | null;
      optionImages?: { value: string; mediaId: string }[];
      variants?: { option1Value: string; option2Value: string | null }[];
      media?: { mediaId: string }[];
    },
  ) {
    const group =
      dto.optionImageGroup === undefined
        ? (existing?.optionImageGroup ?? null)
        : dto.optionImageGroup;
    const images = (dto.optionImages ?? existing?.optionImages ?? []).map((i) => ({
      value: i.value.trim(),
      mediaId: i.mediaId,
    }));

    if (group === null) {
      if (images.length) {
        throw new BadRequestException(
          'Đã chọn ảnh cho từng phân loại nhưng chưa chọn nhóm nào mang ảnh.',
        );
      }
      return;
    }

    const variants = dto.variants ?? existing?.variants ?? [];
    if (variants.length === 0) {
      throw new BadRequestException('Chưa có phân loại nào thì chưa thể đặt ảnh theo phân loại.');
    }

    const name2 =
      (dto.option2Name === undefined ? (existing?.option2Name ?? null) : dto.option2Name)?.trim() ||
      null;
    if (group === 2 && !name2) {
      throw new BadRequestException('Chọn ảnh theo nhóm thứ hai thì phải có nhóm thứ hai.');
    }

    // The values that group actually offers. A photo for anything else is a
    // leftover from a value the owner renamed or removed.
    const allowed = new Set(
      variants
        .map((v) => (group === 1 ? v.option1Value : v.option2Value))
        .map((v) => v?.trim())
        .filter((v): v is string => !!v),
    );

    const seen = new Set<string>();
    for (const image of images) {
      if (!allowed.has(image.value)) {
        throw new BadRequestException(`Không có phân loại nào tên "${image.value}" để gán ảnh.`);
      }
      if (seen.has(image.value)) {
        throw new BadRequestException(`Phân loại "${image.value}" được gán nhiều hơn một ảnh.`);
      }
      seen.add(image.value);
    }

    // Restricted to the product's own gallery on purpose: it keeps the picker
    // down to the handful of photos this product has, and it lets the website
    // answer a chosen colour by moving a picture that is already on the page
    // rather than producing one from nowhere.
    const gallery = new Set(dto.mediaIds ?? existing?.media?.map((m) => m.mediaId) ?? []);
    const stray = images.find((i) => !gallery.has(i.mediaId));
    if (stray) {
      throw new BadRequestException(
        `Ảnh gán cho "${stray.value}" phải là một trong các ảnh của sản phẩm này.`,
      );
    }
  }

  // Prisma would raise an opaque foreign-key error; the admin needs to know
  // which image went missing (e.g. deleted from the media library in another
  // tab while the product form was open).
  private async assertMediaExist(mediaIds?: string[]) {
    if (!mediaIds?.length) return;
    const found = await this.prisma.media.findMany({
      where: { id: { in: mediaIds } },
      select: { id: true },
    });
    if (found.length !== mediaIds.length) {
      const missing = mediaIds.filter((id) => !found.some((m) => m.id === id));
      throw new BadRequestException(`Không tìm thấy tệp media: ${missing.join(', ')}`);
    }
  }
}
