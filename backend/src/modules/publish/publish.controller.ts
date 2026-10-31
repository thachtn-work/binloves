import { Controller, Get, Post } from '@nestjs/common';
import { PublishService } from './publish.service';

// Protected by the global JwtAuthGuard by default (see AuthModule) — fixes
// bin-loves shipping the equivalent of /publish/trigger unauthenticated.
@Controller('publish')
export class PublishController {
  constructor(private readonly publishService: PublishService) {}

  @Get('status')
  getStatus() {
    return this.publishService.getStatus();
  }

  @Post('trigger')
  trigger() {
    return this.publishService.triggerManual();
  }
}
