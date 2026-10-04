import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { SiteSearchService } from './site-search.service';

describe('SiteSearchService', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('it', {
      tools: { library_title: 'Libreria PDF', library_desc: 'Archivio personale', ocr_title: 'OCR', ocr_desc: 'Testo da immagini' },
      sidebar: { items: { my_files: 'I miei file' } },
    });
    translate.use('it');
    return TestBed.inject(SiteSearchService);
  }

  it('finds Library and My files (previously missing from the hand-written index)', () => {
    const search = setup();
    expect(search.search('librer').map(h => h.url)).toContain('/lab/library');
    expect(search.search('miei file').map(h => h.url)).toContain('/lab/i-miei-file');
  });

  it('matches descriptions too and ignores 1-char queries', () => {
    const search = setup();
    expect(search.search('immagini').map(h => h.url)).toEqual(['/lab/ocr']);
    expect(search.search('o')).toEqual([]);
  });

  it('never returns admin-only pages', () => {
    const search = setup();
    expect(search.search('dashboard').some(h => h.url.startsWith('/dashboard'))).toBe(false);
  });
});
