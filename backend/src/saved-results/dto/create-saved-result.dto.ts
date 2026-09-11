import { IsIn, IsNotEmpty, IsObject, IsString, MaxLength } from 'class-validator';
import { SAVED_RESULT_TOOL_TYPES, SavedResultToolType } from '../schemas/saved-result.schema';

export class CreateSavedResultDto {
  @IsIn(SAVED_RESULT_TOOL_TYPES)
  toolType: SavedResultToolType;

  @IsNotEmpty({ message: 'Il titolo è obbligatorio' })
  @IsString()
  @MaxLength(200, { message: 'Il titolo non può superare 200 caratteri' })
  title: string;

  @IsObject({ message: 'Il risultato da salvare non è valido' })
  payload: Record<string, unknown>;
}
