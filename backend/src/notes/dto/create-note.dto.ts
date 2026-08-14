import { IsString, IsOptional, IsEmail, MinLength, MaxLength, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Nome deve essere al massimo 100 caratteri' })
  @Transform(({ value }) => value?.trim())
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email non valida' })
  @MaxLength(255)
  @Transform(({ value }) => value?.trim().toLowerCase())
  email?: string;

  @IsNotEmpty({ message: 'Il contenuto della nota è obbligatorio' })
  @IsString()
  @MinLength(3, { message: 'La nota deve contenere almeno 3 caratteri' })
  @MaxLength(1000, { message: 'La nota non può superare 1000 caratteri' })
  @Transform(({ value }) => value?.trim())
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => value?.trim())
  website?: string;

  @IsOptional()
  @IsString()
  honeypot?: string;
}
