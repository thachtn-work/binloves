import { IsIn, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ALLOWED_CONTENT_TYPES } from './presign-media.dto';
import { MAX_UPLOAD_BYTES } from '../upload.constants';

// The key is chosen by the server when an upload starts, but comes back from
// the browser to finish one. Pinning its shape means a stray or crafted value
// cannot aim a complete/abort at some unrelated object in the bucket.
const KEY_PATTERN = /^(images|videos)\/[0-9a-f-]{36}(\.[a-z0-9]+)?$/;

export class StartMultipartDto {
  @IsString()
  @MaxLength(255)
  filename: string;

  @IsIn(ALLOWED_CONTENT_TYPES as unknown as string[], {
    message: `contentType phải là một trong: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
  })
  contentType: string;

  // Needed up front because the part size, and therefore how many URLs to
  // sign, is derived from it.
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES, { message: `Tệp vượt quá dung lượng tối đa cho phép` })
  size: number;
}

export class CompleteMultipartDto {
  @Matches(KEY_PATTERN, { message: 'key không hợp lệ' })
  key: string;

  @IsString()
  @MaxLength(512)
  uploadId: string;

  @IsString()
  @MaxLength(255)
  filename: string;

  @IsIn(['image', 'video'])
  mediaType: 'image' | 'video';
}

export class AbortMultipartDto {
  @Matches(KEY_PATTERN, { message: 'key không hợp lệ' })
  key: string;

  @IsString()
  @MaxLength(512)
  uploadId: string;
}
