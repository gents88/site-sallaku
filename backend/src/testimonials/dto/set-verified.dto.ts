import { IsBoolean } from 'class-validator';

export class SetVerifiedDto {
  @IsBoolean()
  verified: boolean;
}
