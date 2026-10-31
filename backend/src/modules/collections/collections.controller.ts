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
import { CollectionsService } from './collections.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { SetCollectionProductsDto } from './dto/set-collection-products.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get()
  findAll() {
    return this.collectionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.collectionsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCollectionDto) {
    return this.collectionsService.create(dto);
  }

  // Declared before the `:id` routes so "reorder" is never read as an id.
  @Put('reorder')
  reorder(@Body() dto: ReorderDto) {
    return this.collectionsService.reorder(dto.ids);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCollectionDto) {
    return this.collectionsService.update(id, dto);
  }

  // Separate from PATCH so the two tabs of the detail page ("Thông tin" vs
  // "Sản phẩm") save independently instead of one giant payload.
  @Put(':id/products')
  setProducts(@Param('id') id: string, @Body() dto: SetCollectionProductsDto) {
    return this.collectionsService.setProducts(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.collectionsService.remove(id);
  }
}
