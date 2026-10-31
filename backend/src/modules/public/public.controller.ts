import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PublicService } from './public.service';

// The only unauthenticated read surface. It exposes exclusively isActive
// records, so drafts/hidden products can never leak through the landing build
// even though this endpoint needs no credentials.
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Public()
  @Get('snapshot')
  getSnapshot() {
    return this.publicService.getSnapshot();
  }
}
