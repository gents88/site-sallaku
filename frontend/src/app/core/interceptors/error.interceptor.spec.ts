import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, vi } from 'vitest';
import { SKIP_ERROR_TOAST, errorInterceptor } from './error.interceptor';
import { SnackbarService } from '../services/snackbar.service';

describe('errorInterceptor', () => {
  function setup() {
    const snackbar = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: SnackbarService, useValue: snackbar },
      ],
    });
    return { http: TestBed.inject(HttpClient), ctrl: TestBed.inject(HttpTestingController), snackbar };
  }

  it('un 400 mostra il messaggio del server nel toast', () => {
    const { http, ctrl, snackbar } = setup();
    http.get('/api/x').subscribe({ error: () => {} });
    ctrl.expectOne('/api/x').flush({ message: 'Dati non validi' }, { status: 400, statusText: 'Bad Request' });
    expect(snackbar.show).toHaveBeenCalledWith('Dati non validi', 'error');
  });

  it('con SKIP_ERROR_TOAST niente toast: l\'errore arriva comunque a chi ha chiamato', () => {
    const { http, ctrl, snackbar } = setup();
    const onError = vi.fn();
    http.get('/api/x', { context: new HttpContext().set(SKIP_ERROR_TOAST, true) }).subscribe({ error: onError });
    ctrl.expectOne('/api/x').flush({ message: 'Incorrect password' }, { status: 400, statusText: 'Bad Request' });
    expect(snackbar.show).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });
});
