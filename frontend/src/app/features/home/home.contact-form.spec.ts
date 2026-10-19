import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { HomeComponent } from './home.component';
import { SnackbarService } from '../../core/services/snackbar.service';

describe('HomeComponent — form contatti', () => {
  let http: HttpTestingController;
  let shown: Array<{ message: string; type: string }>;

  beforeEach(() => {
    shown = [];
    TestBed.configureTestingModule({
      imports: [HomeComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SnackbarService, useValue: { show: (message: string, type: string) => shown.push({ message, type }) } },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('it', {
      contact: { form_sent: 'Messaggio inviato! Ti rispondo al più presto.', form_error: 'Invio non riuscito. Riprova tra poco.' },
    });
    translate.use('it');
    http = TestBed.inject(HttpTestingController);
  });

  function filledComponent(): HomeComponent {
    const cmp = TestBed.createComponent(HomeComponent).componentInstance;
    cmp.contactForm = { name: 'Mario Rossi', email: 'mario@example.com', message: 'Vorrei parlare di un progetto.' };
    return cmp;
  }

  it('non mostra "inviato" mentre la richiesta è ancora in corso', () => {
    const cmp = filledComponent();

    cmp.submitContact();

    expect(cmp.contactSending).toBe(true);
    expect(cmp.contactSent).toBe(false);
    expect(shown).toEqual([]);
    http.expectOne(r => r.url.endsWith('/contact')).flush({ success: true });
  });

  it('dopo la risposta positiva mostra l\'esito, svuota il form e usa il testo tradotto', () => {
    const cmp = filledComponent();

    cmp.submitContact();
    http.expectOne(r => r.url.endsWith('/contact')).flush({ success: true });

    expect(cmp.contactSent).toBe(true);
    expect(cmp.contactError).toBe(false);
    expect(cmp.contactSending).toBe(false);
    expect(cmp.contactForm).toEqual({ name: '', email: '', message: '' });
    expect(shown).toEqual([{ message: 'Messaggio inviato! Ti rispondo al più presto.', type: 'success' }]);
  });

  it('se il server rifiuta, non compare mai un successo e il form resta compilato', () => {
    const cmp = filledComponent();

    cmp.submitContact();
    http.expectOne(r => r.url.endsWith('/contact')).flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(cmp.contactSent).toBe(false);
    expect(cmp.contactError).toBe(true);
    expect(cmp.contactSending).toBe(false);
    expect(cmp.contactForm.message).toBe('Vorrei parlare di un progetto.');
    expect(shown).toEqual([{ message: 'Invio non riuscito. Riprova tra poco.', type: 'error' }]);
  });

  it('un secondo invio mentre il primo è in corso non genera una seconda richiesta', () => {
    const cmp = filledComponent();

    cmp.submitContact();
    cmp.submitContact();

    http.expectOne(r => r.url.endsWith('/contact')).flush({ success: true });
    http.verify();
  });

  it('con dati non validi non invia nulla e segnala l\'errore di validazione', () => {
    const cmp = filledComponent();
    cmp.contactForm.email = 'non-una-email';

    cmp.submitContact();

    expect(cmp.contactInvalid).toBe(true);
    expect(cmp.contactSending).toBe(false);
    http.expectNone(r => r.url.endsWith('/contact'));
  });
});
