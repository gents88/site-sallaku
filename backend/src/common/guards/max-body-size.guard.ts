import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  mixin,
  Type,
} from '@nestjs/common';

/**
 * Tetto sul peso TOTALE di una richiesta, controllato sull'header
 * Content-Length prima che multer legga il corpo.
 *
 * Gli upload usano memoryStorage: `fileSize` e `files` limitano ogni singolo
 * file, ma 30 file da 15 MB fanno comunque 450 MB in RAM per una sola
 * richiesta anonima, su un server con 1,8 GB e senza swap. Una guard gira
 * prima degli interceptor, quindi rifiuta senza bufferizzare nulla.
 *
 * Senza Content-Length (chunked) la richiesta viene rifiutata: un client
 * onesto che carica file lo manda sempre.
 */
export function MaxBodySizeGuard(maxBytes: number): Type<CanActivate> {
  @Injectable()
  class MaxBodySizeGuardMixin implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
      const raw = req.headers['content-length'];
      const length = Number(Array.isArray(raw) ? raw[0] : raw);

      if (!Number.isFinite(length) || length <= 0) {
        throw new HttpException('Content-Length header is required for uploads', HttpStatus.LENGTH_REQUIRED);
      }
      if (length > maxBytes) {
        throw new HttpException(
          `Request body too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`,
          HttpStatus.PAYLOAD_TOO_LARGE,
        );
      }
      return true;
    }
  }
  return mixin(MaxBodySizeGuardMixin);
}
