import { ErrorHandler, Injectable, Injector } from '@angular/core';
import { SnackbarService } from '../services/snackbar.service';

/**
 * Global ErrorHandler che cattura eccezioni non gestite:
 * - Errori sincronizzati (throw new Error)
 * - Promise rejections non gestite
 * - Errori in setTimeout/setInterval
 * - Errori nei lifecycle hooks di Angular
 *
 * Lavora in sinergia con error.interceptor che gestisce errori HTTP.
 */
@Injectable({ providedIn: 'root' })
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private injector: Injector) {}

  handleError(error: Error | unknown): void {
    const snackbar = this.injector.get(SnackbarService);

    const errorInfo = this.parseError(error);

    // Log in console per debugging (sviluppatori)
    if (!this.isProduction()) {
      console.error('[UNHANDLED ERROR]', {
        message: errorInfo.message,
        stack: errorInfo.stack,
        context: errorInfo.context,
        originalError: error,
      });
    }

    // Mostra messaggio amichevole all'utente
    snackbar.show(
      this.getUserFriendlyMessage(errorInfo),
      'error',
      5000
    );

    // Opzionale: invia errore a servizio di logging remoto (Sentry, LogRocket, etc.)
    this.reportToLoggingService(errorInfo);
  }

  private parseError(error: unknown): ErrorInfo {
    let message = 'Unknown error';
    let stack = '';
    let context = 'Unknown context';

    if (error instanceof Error) {
      message = error.message || 'Unhandled exception';
      stack = error.stack || '';
      context = this.getErrorContext(error.constructor.name);
    } else if (typeof error === 'string') {
      message = error;
      context = 'String error';
    } else if (error && typeof error === 'object') {
      message = (error as any).message || JSON.stringify(error);
      context = 'Object error';
    }

    return { message, stack, context };
  }

  private getErrorContext(constructorName: string): string {
    const contextMap: Record<string, string> = {
      TypeError: 'Type mismatch or undefined property access',
      ReferenceError: 'Variable not defined',
      RangeError: 'Invalid numeric range',
      SyntaxError: 'Syntax error in code',
      EvalError: 'Eval function error',
      URIError: 'Invalid URI',
      Error: 'Generic error',
    };

    return contextMap[constructorName] || constructorName;
  }

  private getUserFriendlyMessage(info: ErrorInfo): string {
    // Nascondi dettagli tecnici in production
    if (this.isProduction()) {
      return 'Ops! Qualcosa è andato storto. Riprova o contatta il supporto.';
    }

    // In dev, mostra dettagli per debugging
    if (info.context.includes('Type') || info.context.includes('Reference')) {
      return `Errore di programmazione: ${info.message}. Controlla la console.`;
    }

    return `Errore: ${info.message}`;
  }

  private reportToLoggingService(info: ErrorInfo): void {
    // Integrazione con Sentry
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.captureException(new Error(info.message), {
        contexts: { error: info },
      });
    }

    // Opzionale: invia a backend logging endpoint
    // this.injector.get(HttpClient).post('/api/v1/logs/errors', info).subscribe();
  }

  private isProduction(): boolean {
    return typeof window !== 'undefined' && window.location.hostname !== 'localhost';
  }
}

interface ErrorInfo {
  message: string;
  stack: string;
  context: string;
}
