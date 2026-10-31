import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

/**
 * Full ordered list of ids, not a single move. Sending the whole order makes
 * the operation idempotent and lets the server write every sortOrder in one
 * transaction, so a half-applied swap can't leave two rows claiming the same
 * position.
 */
export class ReorderDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  ids: string[];
}
