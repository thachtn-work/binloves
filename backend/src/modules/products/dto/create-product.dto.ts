import { Transform, Type } from 'class-transformer';

/**
 * Trims before the validators run, so a value of spaces fails @IsNotEmpty
 * instead of passing it and being trimmed to nothing on the way to the table.
 */
const Trimmed = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * One sellable combination of the product's option groups.
 *
 * No sale window of its own: the window lives on the product and governs every
 * variant's salePrice at once. No sortOrder either — position in the array is
 * the order, the same contract mediaIds already uses.
 *
 * The rules that need more than one field at a time (a second value without a
 * second group, two rows describing the same combination) are checked in the
 * service, where the whole submitted set is in view.
 */
export class ProductVariantDto {
  @Trimmed()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  option1Value: string;

  @Trimmed()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  option2Value?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  salePrice?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  stockLabel?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * The photograph that stands for one option value.
 *
 * Which group the value belongs to is not repeated here — the product names it
 * once, in `optionImageGroup`. The service checks that the value is really one
 * of that group's, and that the media is already in the product's gallery.
 */
export class ProductOptionImageDto {
  @Trimmed()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  value: string;

  @IsUUID()
  mediaId: string;
}

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug chỉ được chứa chữ thường, số và dấu gạch ngang',
  })
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  // Nullable, unlike `price`: clearing a sale is a thing the owner does, and
  // omitting the field on a PATCH means "leave it alone", which left no way to
  // take a product off sale at all.
  @IsOptional()
  @IsInt()
  @Min(0)
  salePrice?: number | null;

  /**
   * The sale window, as absolute instants.
   *
   * Must carry an offset — the admin sends `...T00:00:00+07:00`, because the
   * shop owner picks a Vietnamese wall-clock time and a bare `2026-12-11T00:00:00`
   * would be read as whatever zone the server happens to be in. `null` clears
   * the end of the window that is being cleared.
   *
   * Ordering and the "a window needs a price" rule are checked in the service,
   * where both fields and the stored row are visible at once; a decorator here
   * could only see one field of one request.
   */
  @IsOptional()
  @IsISO8601({ strict: true })
  saleStartsAt?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  saleEndsAt?: string | null;

  // Free text on purpose — it is a label the shop owner types ("Còn 5 cái"),
  // not a tracked quantity. See project scope: no real inventory.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  stockLabel?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  // Ordered: index in this array becomes ProductMedia.sortOrder, so the admin
  // can drag images around and the landing renders them in that same order.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  // No UUID version pinned: see common/dto/reorder.dto.ts.
  @IsUUID(undefined, { each: true })
  mediaIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  // What the owner calls the two ways this product varies. Nullable so a
  // product can stop having variants: sending null clears the group, the same
  // way null clears salePrice.
  @Trimmed()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  option1Name?: string | null;

  @Trimmed()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  option2Name?: string | null;

  // Replace-not-merge, like mediaIds: the form submits every row it knows
  // about, and omitting the field leaves the existing variants alone. An empty
  // array is how a product goes back to a single price.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];

  // Which option group's values carry their own photo. Null turns per-value
  // photos off, the same way null clears a group name.
  @IsOptional()
  @IsInt()
  @IsIn([1, 2])
  optionImageGroup?: number | null;

  // Replace-not-merge, like variants and mediaIds. Sent as a list rather than a
  // map because a value is free text and would make a brittle JSON key.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ProductOptionImageDto)
  optionImages?: ProductOptionImageDto[];
}
