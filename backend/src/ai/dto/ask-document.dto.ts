import {
  IsArray, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested, ArrayMaxSize, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Un brano di documento scelto dal client come contesto per la domanda.
 *
 * Il retrieval avviene interamente nel browser (la Libreria vive in IndexedDB,
 * il server non ha i documenti): qui arrivano solo i pochi passaggi gia
 * selezionati, mai il documento intero.
 */
export class AskPassageDto {
  @IsString()
  @MaxLength(300)
  docTitle: string;

  @IsInt()
  @Min(1)
  page: number;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text: string;
}

export class AskDocumentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  question: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  lang?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => AskPassageDto)
  passages: AskPassageDto[];
}
