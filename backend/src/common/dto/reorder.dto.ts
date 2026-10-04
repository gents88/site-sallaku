import { ArrayMaxSize, ArrayMinSize, IsArray, IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Nuovo ordine completo (drag & drop in admin): l'indice nell'array diventa il campo `order`. */
export class ReorderDto {
  @ApiProperty({ type: [String], description: 'Id nell\'ordine desiderato' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsMongoId({ each: true })
  ids: string[];
}
