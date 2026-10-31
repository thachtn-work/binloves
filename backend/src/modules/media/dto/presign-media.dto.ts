import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, MaxLength, ValidateNested } from 'class-validator';

// We never see the uploaded bytes (the browser PUTs straight to S3), so the
// content type must be allow-listed here, at presign time — this is the only
// point where the server can refuse to hand out an upload URL for a file type
// we don't want in the bucket.
export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/webm',
] as const;

export class PresignFileDto {
  @IsString()
  @MaxLength(255)
  filename: string;

  @IsIn(ALLOWED_CONTENT_TYPES as unknown as string[], {
    message: `contentType phải là một trong: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
  })
  contentType: string;
}

export class PresignMediaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PresignFileDto)
  files: PresignFileDto[];
}
