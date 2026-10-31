import { ArrayMaxSize, ArrayMinSize, IsArray, Matches } from 'class-validator';

// Same shape the server itself hands out when an upload starts — see
// multipart.dto.ts for why the pattern is pinned.
const KEY_PATTERN = /^(images|videos)\/[0-9a-f-]{36}(\.[a-z0-9]+)?$/;

export class DiscardMediaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @Matches(KEY_PATTERN, { each: true, message: 'key không hợp lệ' })
  keys: string[];
}
