import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StorageService } from '../../common/storage/storage.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfirmMediaDto } from './dto/confirm-media.dto';
import { PresignMediaDto } from './dto/presign-media.dto';
import { AbortMultipartDto, CompleteMultipartDto, StartMultipartDto } from './dto/multipart.dto';
import { DiscardMediaDto } from './dto/discard-media.dto';

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  findAll() {
    // The counts come down with the list so the library can mark — and filter
    // for — files nothing points at. Asking per file would be one request per
    // tile, which at a few hundred files is the page's whole load.
    return this.prisma.media.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { products: true, banners: true, categories: true, collections: true } },
      },
    });
  }

  presign(dto: PresignMediaDto) {
    return Promise.all(dto.files.map((f) => this.storage.presignUpload(f.filename, f.contentType)));
  }

  startMultipart(dto: StartMultipartDto) {
    return this.storage.startMultipart(dto.filename, dto.contentType, dto.size);
  }

  // The multipart counterpart of confirm(): the parts are assembled first, so
  // a Media row only ever exists once storage holds a complete object.
  async completeMultipart(dto: CompleteMultipartDto) {
    await this.storage.completeMultipart(dto.key, dto.uploadId);
    return this.prisma.media.create({
      data: {
        key: dto.key,
        url: this.storage.buildPublicUrl(dto.key),
        mediaType: dto.mediaType,
        filename: dto.filename,
      },
    });
  }

  abortMultipart(dto: AbortMultipartDto) {
    return this.storage.abortMultipart(dto.key, dto.uploadId);
  }

  // Called after the browser has already PUT the bytes straight to storage.
  async confirm(dto: ConfirmMediaDto) {
    const rows = dto.files.map((f) => ({
      key: f.key,
      url: this.storage.buildPublicUrl(f.key),
      mediaType: f.mediaType,
      filename: f.filename,
    }));
    await this.prisma.media.createMany({ data: rows });
    return this.prisma.media.findMany({
      where: { key: { in: rows.map((r) => r.key) } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Throws away objects whose upload was abandoned before confirm() ran —
   * what happens when the owner cancels a batch halfway through.
   *
   * Without this they would sit in the bucket costing money while being
   * invisible to the media library, which is the only place anything can be
   * deleted from. The multipart equivalent is abortMultipart().
   */
  async discard(dto: DiscardMediaDto) {
    for (const key of dto.keys) {
      // A key that reached the library is a real file someone can see. Only
      // uploads that never got that far are ours to throw away.
      const claimed = await this.prisma.media.findFirst({ where: { key } });
      if (claimed) continue;

      try {
        await this.storage.deleteObject(key);
      } catch {
        // Best-effort cleanup running on the cancel path: a failure here must
        // not turn a deliberate cancel into an error the owner has to read.
      }
    }
  }

  // Reported to the admin UI so a shop owner can see why a file can't be
  // deleted, and where to go to detach it first.
  async findUsages(id: string) {
    const [products, banners, categories, collections] = await Promise.all([
      this.prisma.product.findMany({
        where: { media: { some: { mediaId: id } } },
        select: { id: true, name: true },
      }),
      this.prisma.banner.findMany({
        where: { mediaId: id },
        select: { id: true, title: true },
      }),
      this.prisma.category.findMany({
        where: { coverMediaId: id },
        select: { id: true, name: true },
      }),
      this.prisma.collection.findMany({
        where: { coverMediaId: id },
        select: { id: true, name: true },
      }),
    ]);
    return { products, banners, categories, collections };
  }

  async remove(id: string) {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) {
      throw new NotFoundException('Không tìm thấy tệp');
    }

    const usages = await this.findUsages(id);
    if (
      usages.products.length > 0 ||
      usages.banners.length > 0 ||
      usages.categories.length > 0 ||
      usages.collections.length > 0
    ) {
      const names = [
        ...usages.products.map((p) => p.name),
        ...usages.banners.map((b) => b.title ?? 'Banner'),
        ...usages.categories.map((c) => `Danh mục ${c.name}`),
        ...usages.collections.map((c) => `Bộ sưu tập ${c.name}`),
      ].join(', ');
      throw new BadRequestException(
        `Tệp đang được dùng ở: ${names}. Vui lòng gỡ khỏi các mục này trước khi xoá.`,
      );
    }

    // Storage first: if it throws we keep the DB row, so the file stays
    // visible in the media library and can be retried. The reverse order
    // would strand an un-deletable object in the bucket.
    await this.storage.deleteStoredObject(media.key, media.url);
    await this.prisma.media.delete({ where: { id } });
  }
}
