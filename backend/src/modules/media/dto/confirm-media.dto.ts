import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DISPLAY_RATIOS, DisplayRatio } from './update-media-ratio.dto';

export class ConfirmFileDto {
  // Not merely a string: an empty key passes @IsString and produces a row that
  // points at no object and cannot be deleted again, because removal tries the
  // storage object first. Refuse it at the edge instead.
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  key: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename: string;

  @IsIn(['image', 'video'])
  mediaType: 'image' | 'video';

  // Read off the file by the browser before it was sent. Optional because an
  // image has no opinion and a clip the browser could not decode has none
  // either; both land square, which is what the gallery drew before this.
  @IsOptional()
  @IsIn(DISPLAY_RATIOS)
  displayRatio?: DisplayRatio;
}

export class ConfirmMediaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ConfirmFileDto)
  files: ConfirmFileDto[];
}
