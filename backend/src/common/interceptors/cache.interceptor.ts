import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Request, Response } from 'express';

/**
 * HTTP Cache Interceptor
 *
 * Mette in cache automaticamente le risposte GET per migliorare performance.
 *
 * - Cache solo GET requests
 * - Salta cache se ?nocache=true
 * - Usa URL completo come chiave
 * - TTL configurabile (default 60s)
 *
 * @example
 * @UseInterceptors(CacheInterceptor)
 * @Get()
 * async findAll() { ... }
 */
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);
  private readonly defaultTtl = 60 * 1000; // 60 secondi

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, url, query } = request;

    // Cache solo GET requests
    if (method !== 'GET') {
      return next.handle();
    }

    // Skip cache se richiesto esplicitamente
    if (query.nocache === 'true') {
      this.logger.log(`[CACHE SKIP] ${url} (nocache parameter)`);
      return next.handle();
    }

    const cacheKey = this.generateCacheKey(request);
    const cachedData = await this.cacheManager.get<any>(cacheKey);

    // Se esiste in cache, restituisci
    if (cachedData !== undefined) {
      this.logger.log(`[CACHE HIT] ${cacheKey}`);
      response.setHeader('X-Cache', 'HIT');
      response.setHeader('X-Cache-Key', cacheKey);
      return of(cachedData);
    }

    this.logger.log(`[CACHE MISS] ${cacheKey}`);
    response.setHeader('X-Cache', 'MISS');
    response.setHeader('X-Cache-Key', cacheKey);

    // Esegui la richiesta e metti in cache
    return next.handle().pipe(
      tap(async (data) => {
        const ttl = this.extractTtlFromMetadata(context) || this.defaultTtl;
        await this.cacheManager.set(cacheKey, data, ttl);
        this.logger.log(
          `[CACHE SET] ${cacheKey} (TTL: ${ttl}ms)`,
        );
      }),
    );
  }

  /**
   * Genera chiave di cache univoca da request
   * Includi tutti i parametri di query per differenziare le varianti
   */
  private generateCacheKey(request: Request): string {
    const { url } = request;
    // Rimuovi nocache param dalla chiave
    const cleanUrl = url.replace(/[?&]nocache=true/g, '');
    return `cache:${cleanUrl}`;
  }

  /**
   * Estrai TTL dalla metadata del controller se definito
   * Fallback al valore default
   *
   * @example
   * @Get()
   * @CacheTTL(300000) // 5 minuti
   * async findAll() { ... }
   */
  private extractTtlFromMetadata(context: ExecutionContext): number | null {
    const handler = context.getHandler();
    // Cerca la metadata CacheTTL definita sul metodo
    return Reflect.getMetadata('cache:ttl', handler) || null;
  }
}

/**
 * Decorator per personalizzare TTL della cache su specifici endpoint
 *
 * @example
 * @Get()
 * @CacheTTL(5 * 60 * 1000) // Cache per 5 minuti
 * async findAll() { ... }
 */
export function CacheTTL(ttl: number) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata('cache:ttl', ttl, descriptor.value);
    return descriptor;
  };
}
