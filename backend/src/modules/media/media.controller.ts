import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ConfirmMediaDto } from './dto/confirm-media.dto';
import { PresignMediaDto } from './dto/presign-media.dto';
import { AbortMultipartDto, CompleteMultipartDto, StartMultipartDto } from './dto/multipart.dto';
import { DiscardMediaDto } from './dto/discard-media.dto';
import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  findAll() {
    return this.mediaService.findAll();
  }

  @Get(':id/usages')
  findUsages(@Param('id') id: string) {
    return this.mediaService.findUsages(id);
  }

  @Post('presign')
  @HttpCode(HttpStatus.OK)
  presign(@Body() dto: PresignMediaDto) {
    return this.mediaService.presign(dto);
  }

  // Files too large for one PUT go through these three instead of
  // presign/confirm. See upload.constants.ts for where the line sits.
  @Post('multipart/start')
  @HttpCode(HttpStatus.OK)
  startMultipart(@Body() dto: StartMultipartDto) {
    return this.mediaService.startMultipart(dto);
  }

  @Post('multipart/complete')
  @HttpCode(HttpStatus.CREATED)
  completeMultipart(@Body() dto: CompleteMultipartDto) {
    return this.mediaService.completeMultipart(dto);
  }

  @Post('multipart/abort')
  @HttpCode(HttpStatus.NO_CONTENT)
  abortMultipart(@Body() dto: AbortMultipartDto) {
    return this.mediaService.abortMultipart(dto);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.CREATED)
  confirm(@Body() dto: ConfirmMediaDto) {
    return this.mediaService.confirm(dto);
  }

  // Counterpart of abort for the single-PUT path: files that landed in storage
  // before the owner cancelled the batch.
  @Post('discard')
  @HttpCode(HttpStatus.NO_CONTENT)
  discard(@Body() dto: DiscardMediaDto) {
    return this.mediaService.discard(dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.mediaService.remove(id);
  }
}
