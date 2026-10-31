import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CONTENT_CHANGED_EVENT } from '../../common/events/content-changed.event';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSiteSettingsDto } from './dto/update-site-settings.dto';

const SETTINGS_ID = 1;

@Injectable()
export class SiteSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // Upsert on both read and write: the single row may not exist yet on a fresh
  // install, and the admin screen should still open instead of 404-ing.
  get() {
    return this.prisma.siteSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
  }

  async update(dto: UpdateSiteSettingsDto) {
    const settings = await this.prisma.siteSettings.upsert({
      where: { id: SETTINGS_ID },
      update: dto,
      create: { id: SETTINGS_ID, ...dto },
    });
    this.events.emit(CONTENT_CHANGED_EVENT);
    return settings;
  }
}
