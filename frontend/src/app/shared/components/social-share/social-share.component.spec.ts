import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { SocialShareComponent } from './social-share.component';
import { SnackbarService } from '../../../core/services/snackbar.service';

describe('SocialShareComponent', () => {
  function setup(inputs: { image?: string; description?: string } = {}) {
    TestBed.configureTestingModule({
      imports: [SocialShareComponent, TranslateModule.forRoot()],
      providers: [{ provide: SnackbarService, useValue: { show: vi.fn() } }],
    });
    const fixture = TestBed.createComponent(SocialShareComponent);
    fixture.componentRef.setInput('url', 'https://www.gentsallaku.it/en/blog/zoneless');
    fixture.componentRef.setInput('title', 'Angular zoneless');
    if (inputs.image) fixture.componentRef.setInput('image', inputs.image);
    if (inputs.description) fixture.componentRef.setInput('description', inputs.description);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
  }

  it("senza immagine mostra solo i pulsanti, senza l'anteprima", () => {
    const { el } = setup();
    expect(el.querySelector('.social-share__preview')).toBeNull();
    expect(el.querySelectorAll('.social-share__btn').length).toBe(7);
  });

  it("con l'immagine mostra l'anteprima della condivisione: immagine, dominio, titolo e descrizione", () => {
    const { el } = setup({ image: 'https://api.example.com/og.png?lang=en', description: 'Perché Angular diventa zoneless' });
    const img = el.querySelector<HTMLImageElement>('.social-share__preview-img');
    expect(img?.getAttribute('src')).toBe('https://api.example.com/og.png?lang=en');
    expect(el.querySelector('.social-share__preview-domain')?.textContent).toBe('gentsallaku.it');
    expect(el.querySelector('.social-share__preview-title')?.textContent).toBe('Angular zoneless');
    expect(el.querySelector('.social-share__preview-desc')?.textContent).toBe('Perché Angular diventa zoneless');
  });

  it('il dominio resta vuoto con un URL non valido', () => {
    const { component } = setup();
    component.url = 'non-un-url';
    expect(component.domain).toBe('');
  });
});
