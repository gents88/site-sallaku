import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { environment } from '@env/environment';
import { AiQuotaService } from '../services/ai-quota.service';

/**
 * Dopo ogni POST verso /ai/* (anche se fallisce: il server conta la richiesta
 * prima di elaborarla) rilegge la quota, così il contatore mostrato nei tool
 * resta allineato senza che ogni servizio debba ricordarsi di aggiornarlo.
 */
export const aiQuotaInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'POST' || !req.url.startsWith(`${environment.apiUrl}/ai/`)) return next(req);
  const quota = inject(AiQuotaService);
  return next(req).pipe(finalize(() => quota.refresh()));
};
