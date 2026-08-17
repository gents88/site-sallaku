import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Base for skip/limit-paginated list endpoints (notes, testimonials, consent
 * history, ...). Defaults are intentionally left undefined here — each
 * controller/service applies its own historical default via `?? N` at the
 * call site, since different endpoints have always defaulted differently
 * (e.g. notes defaults to 50, consent history to 100).
 */
export class SkipLimitDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** Base for page/limit-paginated list endpoints (contact, blog). */
export class PageLimitDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** For endpoints that only ever take a "top N" limit, no offset/page. */
export class LimitOnlyDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
