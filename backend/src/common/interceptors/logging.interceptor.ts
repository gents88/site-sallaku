import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { Request, Response } from 'express';

/**
 * Logs every incoming HTTP request with method, URL, status code, and wall-clock
 * duration.  Warn-level for 4xx, error-level for 5xx.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const { method, url } = req;

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;
        const status = res.statusCode;
        const line = `${method} ${url} ${status} +${ms}ms`;

        if (status >= 500) {
          this.logger.error(line);
        } else if (status >= 400) {
          this.logger.warn(line);
        } else {
          this.logger.log(line);
        }
      }),
      catchError((err: unknown) => {
        const ms = Date.now() - start;
        this.logger.error(
          `${method} ${url} ERR +${ms}ms`,
          err instanceof Error ? err.stack : String(err),
        );
        return throwError(() => err);
      }),
    );
  }
}
