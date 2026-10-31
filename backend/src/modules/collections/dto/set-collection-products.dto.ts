import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

// Backs the "Sản phẩm trong bộ sưu tập" tab. Array order is the display order
// on the landing page, so the admin's drag-to-reorder maps straight onto this.
export class SetCollectionProductsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  productIds: string[];
}
