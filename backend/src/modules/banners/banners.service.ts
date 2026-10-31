import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CONTENT_CHANGED_EVENT } from '../../common/events/content-changed.event';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';

@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  findAll() {
    return this.prisma.banner.findMany({ orderBy: { sortOrder: 'asc' }, include: { media: true } });
  }

  async findOne(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id }, include: { media: true } });
    if (!banner) {
      throw new NotFoundException('Không tìm thấy banner');
    }
    return banner;
  }

  async create(dto: CreateBannerDto) {
    await this.assertMediaExists(dto.mediaId);
    const banner = await this.prisma.banner.create({ data: dto, include: { media: true } });
    this.events.emit(CONTENT_CHANGED_EVENT);
    return banner;
  }

  async update(id: string, dto: UpdateBannerDto) {
    await this.findOne(id);
    if (dto.mediaId) {
      await this.assertMediaExists(dto.mediaId);
    }
    const banner = await this.prisma.banner.update({
      where: { id },
      data: dto,
      include: { media: true },
    });
    this.events.emit(CONTENT_CHANGED_EVENT);
    return banner;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.banner.delete({ where: { id } });
    this.events.emit(CONTENT_CHANGED_EVENT);
  }

  private async assertMediaExists(mediaId: string) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId }, select: { id: true } });
    if (!media) {
      throw new BadRequestException('Không tìm thấy ảnh đã chọn cho banner');
    }
  }
}
