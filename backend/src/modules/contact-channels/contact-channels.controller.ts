import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ReorderDto } from '../../common/dto/reorder.dto';
import { ContactChannelsService } from './contact-channels.service';
import { CreateContactChannelDto } from './dto/create-contact-channel.dto';
import { UpdateContactChannelDto } from './dto/update-contact-channel.dto';

@Controller('contact-channels')
export class ContactChannelsController {
  constructor(private readonly contactChannelsService: ContactChannelsService) {}

  @Get()
  findAll() {
    return this.contactChannelsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contactChannelsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateContactChannelDto) {
    return this.contactChannelsService.create(dto);
  }

  // Declared before the `:id` routes so "reorder" is never read as an id.
  @Put('reorder')
  reorder(@Body() dto: ReorderDto) {
    return this.contactChannelsService.reorder(dto.ids);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContactChannelDto) {
    return this.contactChannelsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.contactChannelsService.remove(id);
  }
}
