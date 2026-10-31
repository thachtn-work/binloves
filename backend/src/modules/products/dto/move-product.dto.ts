import { IsIn } from 'class-validator';

/**
 * One step at a time, not a whole reordered list.
 *
 * A product's sortOrder is global — unlike a collection's, which lives on its
 * own join row — so rewriting a category's products as 0, 1, 2… would drag
 * them all to the front of every other listing on the site. Swapping the two
 * neighbours' values touches exactly two rows and leaves every other product
 * exactly where it was.
 */
export class MoveProductDto {
  @IsIn(['up', 'down'])
  direction: 'up' | 'down';
}
