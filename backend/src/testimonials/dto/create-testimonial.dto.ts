import {
  IsString,
  IsOptional,
  IsEmail,
  IsUrl,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { Transform } from 'class-transformer';

const withProtocol = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

export class CreateTestimonialDto {
  @IsNotEmpty({ message: 'Il nome è obbligatorio' })
  @IsString()
  @MaxLength(100, { message: 'Il nome deve essere al massimo 100 caratteri' })
  @Transform(({ value }) => value?.trim())
  authorName: string;

  @IsOptional()
  @IsString()
  @MaxLength(150, { message: 'Il ruolo deve essere al massimo 150 caratteri' })
  @Transform(({ value }) => value?.trim())
  role?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Link non valido' })
  @MaxLength(500)
  @Transform(({ value }) => withProtocol(value))
  companyUrl?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email non valida' })
  @MaxLength(255)
  @Transform(({ value }) => value?.trim().toLowerCase())
  email?: string;

  @IsInt({ message: 'La valutazione deve essere un numero intero' })
  @Min(1, { message: 'La valutazione minima è 1' })
  @Max(5, { message: 'La valutazione massima è 5' })
  rating: number;

  @IsNotEmpty({ message: 'La testimonianza è obbligatoria' })
  @IsString()
  @MinLength(10, { message: 'La testimonianza deve contenere almeno 10 caratteri' })
  @MaxLength(600, { message: 'La testimonianza non può superare 600 caratteri' })
  @Transform(({ value }) => value?.trim())
  content: string;

  @IsOptional()
  @IsUrl({}, { message: 'URL avatar non valido' })
  @MaxLength(500)
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => value?.trim())
  website?: string;

  @IsOptional()
  @IsString()
  honeypot?: string;
}
