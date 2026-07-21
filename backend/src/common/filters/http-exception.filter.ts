import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ApiErrorResponse {
  success: boolean;
  statusCode: number;
  message: string;
  errors?: Record<string, any>;
  timestamp: string;
  path: string;
  requestId?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private readonly isDev = process.env.NODE_ENV !== 'production';

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: Record<string, any> | undefined;

    // Gestisci HttpException (errori controllati)
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as any;
        message = resp.message || exception.message;
        errors = resp.error || resp.errors;
      } else {
        message = String(exceptionResponse);
      }
    } else if (exception instanceof Error) {
      // Nascondi dettagli sensibili di database in production
      if (this.isDatabaseError(exception)) {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = 'Database error occurred. Please try again later.';
        this.logger.error(`[DB ERROR] ${exception.message}`, exception.stack);
      } else {
        message = this.isDev ? exception.message : 'An unexpected error occurred';
      }
    }

    // Log completo per debugging
    this.logger.error(
      `[${request.method}] ${request.url} → ${status} | ${message}`,
      exception instanceof Error ? exception.stack : JSON.stringify(exception),
    );

    // Risposta standardizzata
    const errorResponse: ApiErrorResponse = {
      success: false,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: this.extractRequestId(request),
    };

    // Includi errori di validazione se presenti (400)
    if (status === HttpStatus.BAD_REQUEST && errors) {
      errorResponse.errors = errors;
    }

    // Stack trace solo in development
    if (this.isDev && exception instanceof Error) {
      (errorResponse as any).stack = exception.stack;
    }

    response.status(status).json(errorResponse);
  }

  private isDatabaseError(error: Error): boolean {
    const dbErrorPatterns = [
      'duplicate key',
      'foreign key',
      'unique constraint',
      'not null constraint',
      'QueryFailedError',
      'PrismaClientKnownRequestError',
      'MongoError',
      'MongoBulkWriteError',
      'MongooseError',
      'ValidationError',
      'CastError',
    ];

    const errorStr = `${error.name} ${error.message}`.toLowerCase();
    return dbErrorPatterns.some(pattern => errorStr.includes(pattern.toLowerCase()));
  }

  private extractRequestId(request: Request): string | undefined {
    return (
      (request.headers['x-request-id'] as string) ||
      (request.headers['x-correlation-id'] as string) ||
      undefined
    );
  }
}
