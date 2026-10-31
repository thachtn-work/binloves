import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CONTENT_CHANGED_EVENT } from '../../common/events/content-changed.event';
import { withUniqueSlug } from '../../common/prisma/unique-slug';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  findAll() {
    return this.prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { cover: true },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { cover: true },
    });
    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }
    return category;
  }

  async create(dto: CreateCategoryDto) {
    await this.assertCoverIsUsable(dto.coverMediaId);
    const category = await withUniqueSlug('danh mục', async () =>
      this.prisma.category.create({
        // Ordering is managed from the list, so the form sends no position.
        // Append rather than defaulting to 0, which would tie every new row
        // for first place and make the order look random.
        data: { ...dto, sortOrder: dto.sortOrder ?? (await this.nextSortOrder()) },
        include: { cover: true },
      }),
    );
    // Write is committed — now, and only now, announce it. PublishService (not
    // this service) decides what to do about it. See content-changed.event.ts.
    this.events.emit(CONTENT_CHANGED_EVENT);
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);
    await this.assertCoverIsUsable(dto.coverMediaId);
    const category = await withUniqueSlug('danh mục', () =>
      this.prisma.category.update({ where: { id }, data: dto, include: { cover: true } }),
    );
    this.events.emit(CONTENT_CHANGED_EVENT);
    return category;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.category.delete({ where: { id } });
    this.events.emit(CONTENT_CHANGED_EVENT);
  }

  /**
   * Undefined means the form didn't touch the cover; null means clear it.
   * Only a real id is checked — against existence, and against being a clip:
   * the homepage renders these as still circles, so a video would arrive as a
   * dead frame rather than something that plays.
   */
  private async assertCoverIsUsable(coverMediaId: string | null | undefined) {
    if (!coverMediaId) return;
    const media = await this.prisma.media.findUnique({
      where: { id: coverMediaId },
      select: { mediaType: true },
    });
    if (!media) {
      throw new BadRequestException('Không tìm thấy ảnh đã chọn cho danh mục');
    }
    if (media.mediaType !== 'image') {
      throw new BadRequestException('Ảnh đại diện danh mục phải là ảnh, không dùng được video');
    }
  }

  private async nextSortOrder() {
    const last = await this.prisma.category.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }

  async reorder(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.category.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    this.events.emit(CONTENT_CHANGED_EVENT);
    return this.findAll();
  }
}
