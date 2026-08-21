import { IsOptional, IsString, MaxLength } from 'class-validator';
import { LimitOnlyDto } from '../../common/dto/pagination.dto';

/**
 * Query di `GET /analytics/click-stats`. Estende il solo `limit` storico con un
 * filtro per famiglia di evento (`sidebar`, `sidebar_nav`, `cta`, ...), così da
 * poter leggere il funnel di una singola superficie senza che le sue label
 * vengano troncate fuori dalla classifica globale.
 */
export class ClickStatsQueryDto extends LimitOnlyDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  eventType?: string;
}
