import { IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateTestimonialContentDto {
  @IsString()
  @MinLength(10)
  @MaxLength(600)
  content: string;
}
