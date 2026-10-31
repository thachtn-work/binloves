import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

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
}

export class ConfirmMediaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ConfirmFileDto)
  files: ConfirmFileDto[];
}
