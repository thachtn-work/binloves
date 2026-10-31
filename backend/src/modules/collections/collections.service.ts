import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { CONTENT_CHANGED_EVENT } from '../../common/events/content-changed.event';
import { withUniqueSlug } from '../../common/prisma/unique-slug';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { SetCollectionProductsDto } from './dto/set-collection-products.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';

const COLLECTION_DETAIL_INCLUDE = {
  cover: true,
  products: {
    include: {
      product: { include: { media: { include: { media: true }, orderBy: { sortOrder: 'asc' } } } },
    },
    orderBy: { sortOrder: 'asc' },
  },
} satisfies Prisma.CollectionInclude;

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  findAll() {
    return this.prisma.collection.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: true } }, cover: true },
    });
  }

  async findOne(id: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      include: COLLECTION_DETAIL_INCLUDE,
    });
    if (!collection) {
      throw new NotFoundException('Không tìm thấy bộ sưu tập');
    }
    return collection;
  }

  /**
   * Undefined means the form didn't touch the cover; null means clear it.
   * Only a real id is checked — against existence, and against being a clip:
   * the homepage draws these as still circles, so a video would arrive as a
   * dead frame rather than something that plays.
   */
  private async assertCoverIsUsable(coverMediaId: string | null | undefined) {
    if (!coverMediaId) return;
    const media = await this.prisma.media.findUnique({
      where: { id: coverMediaId },
      select: { mediaType: true },
    });
    if (!media) {
      throw new BadRequestException('Không tìm thấy ảnh đã chọn cho bộ sưu tập');
    }
    if (media.mediaType !== 'image') {
      throw new BadRequestException('Ảnh đại diện bộ sưu tập phải là ảnh, không dùng được video');
    }
  }

  async create(dto: CreateCollectionDto) {
    await this.assertCoverIsUsable(dto.coverMediaId);
    const collection = await withUniqueSlug('bộ sưu tập', async () =>
      this.prisma.collection.create({
        // See CategoriesService.create — new rows append instead of all
        // claiming position 0.
        data: { ...dto, sortOrder: dto.sortOrder ?? (await this.nextSortOrder()) },
      }),
    );
    this.events.emit(CONTENT_CHANGED_EVENT);
    return collection;
  }

  async update(id: string, dto: UpdateCollectionDto) {
    await this.ensureExists(id);
    await this.assertCoverIsUsable(dto.coverMediaId);
    const collection = await withUniqueSlug('bộ sưu tập', () =>
      this.prisma.collection.update({ where: { id }, data: dto }),
    );
    this.events.emit(CONTENT_CHANGED_EVENT);
    return collection;
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.collection.delete({ where: { id } });
    this.events.emit(CONTENT_CHANGED_EVENT);
  }

  private async nextSortOrder() {
    const last = await this.prisma.collection.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }

  async reorder(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.collection.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    this.events.emit(CONTENT_CHANGED_EVENT);
    return this.findAll();
  }

  async setProducts(id: string, dto: SetCollectionProductsDto) {
    await this.ensureExists(id);

    const found = await this.prisma.product.findMany({
      where: { id: { in: dto.productIds } },
      select: { id: true },
    });
    if (found.length !== dto.productIds.length) {
      const missing = dto.productIds.filter((pid) => !found.some((p) => p.id === pid));
      throw new BadRequestException(`Không tìm thấy sản phẩm: ${missing.join(', ')}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.collectionProduct.deleteMany({ where: { collectionId: id } });
      if (dto.productIds.length) {
        await tx.collectionProduct.createMany({
          data: dto.productIds.map((productId, index) => ({
            collectionId: id,
            productId,
            sortOrder: index,
          })),
        });
      }
    });

    this.events.emit(CONTENT_CHANGED_EVENT);
    return this.findOne(id);
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.collection.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw new NotFoundException('Không tìm thấy bộ sưu tập');
    }
  }
}
