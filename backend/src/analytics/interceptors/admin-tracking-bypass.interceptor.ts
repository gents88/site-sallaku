import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Observable, of } from 'rxjs';

interface TokenRolePayload {
  role?: string;
}

/**
 * Silently short-circuits tracking endpoints when the request carries an admin JWT.
 * The frontend auth interceptor attaches the Bearer token to every request, so a
 * logged-in admin browsing the public site is recognized here even though the
 * tracking endpoints themselves are public.
 *
 * The response shape matches a successful track call so the client never notices.
 */
@Injectable()
export class AdminTrackingBypassInterceptor implements NestInterceptor {
  constructor(private readonly jwt: JwtService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (this.isAdminRequest(req)) {
      return of({ success: true, tracked: false });
    }
    return next.handle();
  }

  private isAdminRequest(req: Request): boolean {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) return false;
    const token = header.slice('Bearer '.length);

    try {
      const payload = this.jwt.verify<TokenRolePayload>(token);
      return payload?.role === 'admin';
    } catch {
      // Expired or unverifiable token: fall back to a plain decode. Over-excluding a
      // stale admin token is harmless — this gate only filters analytics, it grants nothing.
      const decoded = this.jwt.decode<TokenRolePayload | null>(token);
      return decoded?.role === 'admin';
    }
  }
}
