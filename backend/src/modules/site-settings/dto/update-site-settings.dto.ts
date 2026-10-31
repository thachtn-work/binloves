import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Every field is nullable, not merely optional: the admin sends `null` for a
 * box the owner emptied. `@IsOptional()` lets null through, and the column it
 * writes to is nullable too, so clearing a field actually clears it.
 */
export class UpdateSiteSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  shopName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tagline?: string | null;

  // Shown to visitors in the corner of the home hero. Capped where the
  // paragraph still fits that corner without crowding the headline beside it.
  @IsOptional()
  @IsString()
  @MaxLength(600)
  intro?: string | null;

  // Used as the landing's <meta name="description">.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  seoDescription?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  // Free text ("8:00 - 21:00, T2 - CN"). Deliberately not structured: nothing
  // computes an "đang mở cửa" state, it is only ever displayed.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  businessHours?: string | null;
}
