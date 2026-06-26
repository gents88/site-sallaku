import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { AuditService } from '../audit.service';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Intercepts authenticated write requests and persists an audit log entry.
 * Attach to controllers that require an audit trail:
 *
 *   @UseInterceptors(AuditInterceptor)
 *   @Controller('blog')
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { _id?: string; sub?: string; email?: string } }>();
    const res = http.getResponse<Response>();

    if (!WRITE_METHODS.has(req.method)) {
      return next.handle();
    }

    const actor = req.user;
    if (!actor) return next.handle(); // unauthenticated — skip

    return next.handle().pipe(
      tap(() => {
        void this.audit.log({
          actorId: String(actor._id ?? actor.sub ?? 'unknown'),
          actorEmail: actor.email ?? 'unknown',
          method: req.method,
          path: req.url,
          statusCode: res.statusCode,
        });
      }),
    );
  }
}
