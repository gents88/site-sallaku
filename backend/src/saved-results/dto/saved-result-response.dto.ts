import { Exclude } from 'class-transformer';
import { SavedResultToolType } from '../schemas/saved-result.schema';

export class SavedResultResponseDto {
  id: string;

  toolType: SavedResultToolType;

  title: string;

  payload: Record<string, unknown>;

  createdAt: Date;

  updatedAt: Date;

  @Exclude()
  userId: string;
}

/** List entries omit the payload — it can be large and isn't needed until a single item is opened. */
export class SavedResultListItemDto {
  id: string;

  toolType: SavedResultToolType;

  title: string;

  createdAt: Date;
}
