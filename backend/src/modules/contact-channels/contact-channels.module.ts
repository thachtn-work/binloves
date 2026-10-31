import { Module } from '@nestjs/common';
import { ContactChannelsController } from './contact-channels.controller';
import { ContactChannelsService } from './contact-channels.service';

@Module({
  controllers: [ContactChannelsController],
  providers: [ContactChannelsService],
})
export class ContactChannelsModule {}
