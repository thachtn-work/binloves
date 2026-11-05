import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

/**
 * Full ordered list of ids, not a single move. Sending the whole order makes
 * the operation idempotent and lets the server write every sortOrder in one
 * transaction, so a half-applied swap can't leave two rows claiming the same
 * position.
 *
 * No UUID version is pinned on purpose.
 *
 * This shop's catalogue was imported from the system it ran before, and those
 * rows carry v7 ids; only what has been created here since gets Prisma's v4.
 * Asking for v4 rejected the shop's own data, so every id that came across --
 * all 14 categories, all 14 collections, all 262 products, 1617 of 1620 media
 * -- was refused with "each value in ids must be a UUID" before the request
 * reached a service. The version nibble says which algorithm minted the id,
 * which is nothing this app decides or depends on; the shape check is what
 * keeps a stray string out, and that is kept.
 */
export class ReorderDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  ids: string[];
}
