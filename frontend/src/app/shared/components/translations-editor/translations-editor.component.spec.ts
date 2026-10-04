import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TranslationsEditorComponent, compactTranslations } from './translations-editor.component';
import { BlogService } from '../../../core/services/blog.service';

function setup(translateText: (text: string, from: string, to: string) => ReturnType<BlogService['translateText']>) {
  const blog = { translateText: vi.fn(translateText) };
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [provideNoopAnimations(), { provide: BlogService, useValue: blog }],
  });
  const fixture = TestBed.createComponent(TranslationsEditorComponent);
  fixture.componentRef.setInput('fields', [{ key: 'title', labelKey: 't' }, { key: 'description', labelKey: 'd', multiline: true }]);
  fixture.componentRef.setInput('source', { title: 'Titolo', description: 'Descrizione' });
  fixture.componentRef.setInput('translations', { en: { title: 'Already done' } });
  fixture.detectChanges();
  return { component: fixture.componentInstance, blog };
}

describe('TranslationsEditorComponent', () => {
  it('auto-translates only the empty fields, from Italian, into the active language', () => {
    const { component, blog } = setup((text) => of(`EN:${text}`));
    component.autoTranslate('en');
    expect(blog.translateText).toHaveBeenCalledTimes(1);
    expect(blog.translateText).toHaveBeenCalledWith('Descrizione', 'it', 'en');
    expect(component.translations().en).toEqual({ title: 'Already done', description: 'EN:Descrizione' });
    expect(component.filledCount('en')).toBe(2);
  });

  it('keeps manual edits and reports an error when the translation service fails', () => {
    const { component } = setup(() => throwError(() => new Error('429')));
    component.autoTranslate('de');
    expect(component.error()).toBe(true);
    expect(component.translating()).toBe(false);
    expect(component.translations().en?.['title']).toBe('Already done');
  });
});

describe('compactTranslations', () => {
  it('drops blank fields and languages left empty, trimming the rest', () => {
    expect(compactTranslations({ en: { title: ' Hi ', description: '  ' }, de: { title: '' } })).toEqual({ en: { title: 'Hi' } });
  });
});
