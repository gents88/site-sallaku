import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { HomeComponent } from './home.component';

describe('FAQ della home', () => {
  it('ha le domande su chi sei e sugli strumenti, e non quella sulla disponibilità per progetti remoti/ibridi', () => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
    TestBed.configureTestingModule({
      imports: [HomeComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const cmp = TestBed.createComponent(HomeComponent).componentInstance;
    expect(cmp.faqItems.map(i => i.qKey)).toEqual([
      'faq.q_who', 'faq.q1', 'faq.q2', 'faq.q_merge', 'faq.q_compress', 'faq.q_heic', 'faq.q_privacy', 'faq.q4',
    ]);
    vi.unstubAllGlobals();
  });
});
