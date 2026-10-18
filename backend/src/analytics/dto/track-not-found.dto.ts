import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { NOT_FOUND_KINDS, NotFoundKind } from '../not-found/not-found-hit.schema';

export class TrackNotFoundDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  path: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  referrer?: string;

  @IsOptional()
  @IsIn(NOT_FOUND_KINDS)
  kind?: NotFoundKind;
}
