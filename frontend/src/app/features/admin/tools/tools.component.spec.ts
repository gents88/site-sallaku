import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { ToolsComponent } from './tools.component';
import { LanguageService } from '../../../core/services/language.service';
import { SeoService } from '../../../core/services/seo.service';
import { WorkspaceService } from '../../../core/services/workspace.service';

function setup(lang: string, before?: () => void) {
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: LanguageService, useValue: { current: () => lang } },
      { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) } },
    ],
  });
  before?.();
  const fixture = TestBed.createComponent(ToolsComponent);
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
}

describe('ToolsComponent (Lab)', () => {
  it('builds its cards from the navigation registry, same order as the sidebar', () => {
    const { component } = setup('it');
    expect(component.aiCards.map(c => c.route)).toEqual([
      '/lab/pdf-search', '/lab/library', '/lab/pdf-summary', '/lab/ai-formatter', '/lab/pdf-translate', '/lab/ai-ppt',
    ]);
    expect(component.toolCards).toHaveLength(6);
  });

  it('keeps the language prefix on card links (regression: /en/lab linked to Italian pages)', () => {
    const { el } = setup('en');
    const hrefs = Array.from(el.querySelectorAll('a.tool-card, a.workspace-banner')).map(a => a.getAttribute('href'));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every(h => h?.startsWith('/en/lab/'))).toBe(true);
  });

  describe('pick up where you left off', () => {
    it('lists the recently used tools, with language prefix', () => {
      localStorage.setItem('gs.lab-recent-tools', JSON.stringify([{ id: 'ocr', usedAt: 2 }, { id: 'pdf-summary', usedAt: 1 }]));
      const { el } = setup('en');
      const hrefs = Array.from(el.querySelectorAll('.resume a.tool-card')).map(a => a.getAttribute('href'));
      expect(hrefs).toEqual(['/en/lab/ocr', '/en/lab/pdf-summary']);
      localStorage.clear();
    });

    it('offers where to open the file waiting in the workspace', () => {
      localStorage.clear();
      const { el } = setup('it', () =>
        TestBed.inject(WorkspaceService).send({ kind: 'text', text: 'x', filename: 'ocr-text.txt', fromTool: 'ocr' }));
      expect(el.querySelector('.resume-pending')?.textContent).toContain('lab_next.pending');
      expect(Array.from(el.querySelectorAll('.resume-chip')).map(a => a.getAttribute('href'))).toEqual(['/lab/ai-formatter', '/lab/editor']);
    });

    it('shows nothing on a first visit', () => {
      localStorage.clear();
      const { el } = setup('it');
      expect(el.querySelector('.resume')).toBeNull();
    });
  });

  describe('drag & drop anywhere on the page', () => {
    const drag = (type: string, files: File[] = [], types = ['Files']) =>
      Object.assign(new Event(type, { cancelable: true }), { dataTransfer: { types, files } }) as unknown as DragEvent;
    const pdf = () => new File(['%PDF-1.4'], 'contratto.pdf', { type: 'application/pdf' });

    function render() {
      localStorage.clear();
      return setup('it');
    }

    it('shows the overlay while a file is dragged over, without flickering on child elements', () => {
      const { component } = render();
      component.onDragEnter(drag('dragenter'));
      component.onDragEnter(drag('dragenter')); // entra in un elemento figlio
      component.onDragLeave(drag('dragleave')); // ...ed esce dal genitore
      expect(component.dragging()).toBe(true);
      component.onDragLeave(drag('dragleave'));
      expect(component.dragging()).toBe(false);
    });

    it('ignores drags that do not carry files (text, links)', () => {
      const { component } = render();
      const over = drag('dragover', [], ['text/plain']);
      component.onDragEnter(drag('dragenter', [], ['text/plain']));
      component.onDragOver(over);
      expect(component.dragging()).toBe(false);
      expect(over.defaultPrevented).toBe(false);
    });

    it('a dropped PDF goes to the workspace and the page suggests the PDF tools', () => {
      const { el, component } = render();
      const over = drag('dragover');
      component.onDragOver(over);
      expect(over.defaultPrevented).toBe(true); // altrimenti il browser aprirebbe il file

      const drop = drag('drop', [pdf()]);
      component.onDragEnter(drag('dragenter'));
      component.onDrop(drop);
      TestBed.tick();

      expect(drop.defaultPrevented).toBe(true);
      expect(component.dragging()).toBe(false);
      const item = TestBed.inject(WorkspaceService).current();
      expect(item).toMatchObject({ kind: 'file', filename: 'contratto.pdf', mime: 'application/pdf', fromTool: 'lab' });
      expect(item?.blob).toBeInstanceOf(File);
      const hrefs = Array.from(el.querySelectorAll('.resume-chip')).map(a => a.getAttribute('href'));
      expect(hrefs).toEqual(['/lab/pdf-summary', '/lab/pdf-translate', '/lab/ocr', '/lab/pdf-editor', '/lab/viewer', '/lab/convert']);
    });

    it('uses only the first of several files and says so', () => {
      const { el, component } = render();
      component.useFiles([pdf(), new File(['x'], 'b.txt'), new File(['y'], 'c.txt')]);
      TestBed.tick();
      expect(TestBed.inject(WorkspaceService).current()?.filename).toBe('contratto.pdf');
      expect(component.ignoredFiles()).toBe(2);
      expect(el.querySelector('.resume-note')?.textContent).toContain('lab_drop.only_first');
    });

    it('works from the file picker too (mobile has no drag & drop), and resets the input', () => {
      const { component } = render();
      const input = document.createElement('input');
      input.type = 'file';
      Object.defineProperty(input, 'files', { value: [new File(['a'], 'foto.jpg', { type: 'image/jpeg' })] });
      component.onPick({ target: input } as unknown as Event);
      expect(TestBed.inject(WorkspaceService).current()?.filename).toBe('foto.jpg');
    });

    it('does nothing for an empty drop', () => {
      const { component } = render();
      component.onDrop(drag('drop', []));
      expect(TestBed.inject(WorkspaceService).current()).toBeNull();
    });
  });
});
