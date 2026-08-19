import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { SuggestQueryDto } from './dto/suggest-query.dto';
import { CacheControlInterceptor } from '../common/interceptors/cache-control.interceptor';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @UseInterceptors(new CacheControlInterceptor(30, 15))
  @ApiOperation({ summary: 'Full-text search across published posts and projects (public)' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'lang', required: false })
  @ApiQuery({ name: 'type', required: false, enum: ['post', 'project'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  search(@Query() { q, lang, type, page, limit }: SearchQueryDto) {
    return this.searchService.search(q, lang, type, page ?? 1, limit ?? 10);
  }

  // Keystroke-driven from the frontend's debounced (250ms) autocomplete —
  // needs a looser budget than the full-search endpoint above.
  @Get('suggest')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @UseInterceptors(new CacheControlInterceptor(30, 15))
  @ApiOperation({ summary: 'Lightweight autocomplete suggestions (public, top 5)' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'lang', required: false })
  suggest(@Query() { q, lang }: SuggestQueryDto) {
    return this.searchService.suggest(q, lang);
  }
}
