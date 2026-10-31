import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CONTENT_CHANGED_EVENT } from '../../common/events/content-changed.event';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContactChannelDto } from './dto/create-contact-channel.dto';
import { UpdateContactChannelDto } from './dto/update-contact-channel.dto';

@Injectable()
export class ContactChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  findAll() {
    return this.prisma.contactChannel.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async findOne(id: string) {
    const channel = await this.prisma.contactChannel.findUnique({ where: { id } });
    if (!channel) {
      throw new NotFoundException('Không tìm thấy kênh liên hệ');
    }
    return channel;
  }

  async create(dto: CreateContactChannelDto) {
    const channel = await this.prisma.contactChannel.create({
      // Ordering is managed with the arrows on each card, so the form sends no
      // position. Append rather than defaulting to 0, which would tie every
      // new channel for first place.
      data: { ...dto, sortOrder: dto.sortOrder ?? (await this.nextSortOrder()) },
    });
    this.events.emit(CONTENT_CHANGED_EVENT);
    return channel;
  }

  private async nextSortOrder() {
    const last = await this.prisma.contactChannel.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }

  async reorder(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.contactChannel.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    this.events.emit(CONTENT_CHANGED_EVENT);
    return this.findAll();
  }

  async update(id: string, dto: UpdateContactChannelDto) {
    await this.findOne(id);
    const channel = await this.prisma.contactChannel.update({ where: { id }, data: dto });
    this.events.emit(CONTENT_CHANGED_EVENT);
    return channel;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.contactChannel.delete({ where: { id } });
    this.events.emit(CONTENT_CHANGED_EVENT);
  }
}
