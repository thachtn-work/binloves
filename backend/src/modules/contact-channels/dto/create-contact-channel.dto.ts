import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Known types drive the icon/label the landing renders. Kept as a string column
// in the DB (not a Postgres enum) so adding a channel is a one-line change
// here, not a migration.
export const CONTACT_CHANNEL_TYPES = [
  'zalo',
  'phone',
  'messenger',
  'facebook',
  'instagram',
  'tiktok',
  'telegram',
  'email',
] as const;

export class CreateContactChannelDto {
  @IsIn(CONTACT_CHANNEL_TYPES as unknown as string[], {
    message: `type phải là một trong: ${CONTACT_CHANNEL_TYPES.join(', ')}`,
  })
  type: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  value: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
