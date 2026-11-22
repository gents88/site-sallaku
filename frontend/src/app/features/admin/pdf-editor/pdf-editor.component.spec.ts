import { TestBed } from '@angular/core/testing';
import { importProvidersFrom } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { PdfEditorComponent } from './pdf-editor.component';
import { PdfjsService } from '../../../core/services/pdfjs.service';
import { SeoService } from '../../../core/services/seo.service';
import { WorkspaceService } from '../../../core/services/workspace.service';

type Entry = { id: number; src: number; page: number; rot: 0 | 90 | 180 | 270; thumb: string | null };
const entry = (id: number): Entry => ({ id, src: 0, page: id - 1, rot: 0, thumb: `t${id}` });

describe('PdfEditorComponent — annulla e duplica', () => {
  let component: PdfEditorComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        { provide: PdfjsService, useValue: {} },
        { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) } },
        { provide: WorkspaceService, useValue: { peek: () => null } },
      ],
    });
    component = TestBed.createComponent(PdfEditorComponent).componentInstance;
    // id alti: nel componente nextId parte da 1 e non deve collidere con quelli del test
    component.pages.set([entry(101), entry(102), entry(103)]);
  });

  it('annulla l\'eliminazione di una pagina', () => {
    expect(component.canUndo()).toBe(false);
    component.remove(1);
    expect(component.pages().map((p) => p.id)).toEqual([101, 103]);
    expect(component.canUndo()).toBe(true);

    component.undo();
    expect(component.pages().map((p) => p.id)).toEqual([101, 102, 103]);
    expect(component.canUndo()).toBe(false);
  });

  it('annulla rotazione e spostamento, in ordine inverso', () => {
    component.rotate(0);
    component.move(0, 1);
    expect(component.pages().map((p) => p.id)).toEqual([102, 101, 103]);

    component.undo();
    expect(component.pages().map((p) => p.id)).toEqual([101, 102, 103]);
    expect(component.pages()[0].rot).toBe(90);
    component.undo();
    expect(component.pages()[0].rot).toBe(0);
  });

  it('duplica una pagina subito dopo l\'originale con un id nuovo', () => {
    component.duplicate(0);
    const pages = component.pages();
    expect(pages).toHaveLength(4);
    expect(pages[1].page).toBe(pages[0].page);
    expect(new Set(pages.map((p) => p.id)).size).toBe(4);

    component.undo();
    expect(component.pages()).toHaveLength(3);
  });

  it('reset azzera anche la cronologia di annulla', () => {
    component.remove(0);
    component.reset();
    expect(component.canUndo()).toBe(false);
  });
});
