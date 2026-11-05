import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

/**
 * The full new order of one category's products.
 *
 * A single move is a swap and touches two rows; dragging a product across the
 * list is not, so this sends the whole order and lets the server write it in
 * one transaction rather than firing a burst of swaps that could half-apply.
 */
export class ReorderProductsDto {
  // No UUID version pinned: see common/dto/reorder.dto.ts.
  @IsUUID()
  categoryId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  ids: string[];
}
