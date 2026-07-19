import { IsOptional, IsPositive, Max, Min, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO base per paginazione
 * Usabile in tutte le route GET che restituiscono liste
 *
 * @example
 * GET /api/v1/blog?page=1&limit=10&sort=createdAt:DESC
 */
export class PaginationDto {
  @ApiPropertyOptional({
    description: 'Numero pagina (1-indexed)',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsPositive({ message: 'page deve essere positivo' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Numero di elementi per pagina',
    example: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsPositive({ message: 'limit deve essere positivo' })
  @Max(100, { message: 'limit non può superare 100 elementi per performance' })
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Ordine: CAMPO:DIREZIONE (es: createdAt:DESC)',
    example: 'createdAt:DESC',
  })
  @IsOptional()
  @IsString()
  sort?: string = 'createdAt:DESC';

  @ApiPropertyOptional({
    description: 'Campo di ricerca testuale (se supportato dal controller)',
    example: 'angular',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * Interfaccia per risposta paginata
 * Usare in tutti i servizi che restituiscono liste
 *
 * @template T Tipo degli elementi nella lista
 */
export interface PaginatedResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T[];
  pagination: PaginationMeta;
  timestamp: string;
}

/**
 * Metadata di paginazione
 */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Helper per creare una risposta paginata
 *
 * @example
 * const items = await this.blogService.findAll(paginationDto);
 * return createPaginatedResponse(items, paginationDto, totalCount);
 */
export function createPaginatedResponse<T>(
  data: T[],
  pagination: { page: number; limit: number },
  total: number,
): PaginatedResponse<T> {
  const pages = Math.ceil(total / pagination.limit);

  return {
    success: true,
    statusCode: 200,
    message: 'Success',
    data,
    pagination: {
      total,
      page: pagination.page,
      limit: pagination.limit,
      pages,
      hasNextPage: pagination.page < pages,
      hasPreviousPage: pagination.page > 1,
    },
    timestamp: new Date().toISOString(),
  };
}
