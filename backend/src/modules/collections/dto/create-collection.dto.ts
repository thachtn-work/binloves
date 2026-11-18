import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCollectionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  /*
    No slug. The address is derived from the name by common/slug.ts when the
    row is created, and never changes afterwards — a live URL that moves on
    its own breaks every link already shared for it. Sending one is refused
    outright rather than ignored, so a client that still thinks it decides
    addresses is told so instead of watching its value vanish.
  */

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  /**
   * The collection's own photo for the homepage row. `null` clears it and
   * hands the choice back to the site, which then shows the first photo of
   * the first product inside.
   */
  @IsOptional()
  // No UUID version pinned: see common/dto/reorder.dto.ts.
  @IsUUID()
  coverMediaId?: string | null;
}
