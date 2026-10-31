import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';

export class CreateBannerDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'linkUrl phải là một đường dẫn hợp lệ' })
  @MaxLength(2000)
  linkUrl?: string;

  @IsUUID()
  mediaId: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
