import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response } from 'express';

/**
 * Sets Cache-Control headers on public GET responses so browsers and CDN
 * edge nodes can cache them, reducing round-trips to the API.
 *
 * Defaults to `public, max-age=60, stale-while-revalidate=30`.
 * Override per-endpoint with the @CacheHeader() decorator if needed.
 */
@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(
    private readonly maxAge: number = 60,
    private readonly swr: number = 30,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<{ method: string }>();
    const res = http.getResponse<Response>();

    return next.handle().pipe(
      tap(() => {
        if (req.method === 'GET' && res.statusCode >= 200 && res.statusCode < 300) {
          res.setHeader(
            'Cache-Control',
            `public, max-age=${this.maxAge}, stale-while-revalidate=${this.swr}`,
          );
        }
      }),
    );
  }
}
