import { IsBoolean } from 'class-validator';

export class SetFeaturedDto {
  @IsBoolean()
  featured: boolean;
}
