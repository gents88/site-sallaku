import { importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpEventType, HttpResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScannerComponent } from './scanner.component';
import { ConversionService } from '../../../core/services/conversion.service';
import { OcrService } from '../../../core/services/ocr.service';
import { SeoService } from '../../../core/services/seo.service';
import { WorkspaceService } from '../../../core/services/workspace.service';

function page(id: number) {
  return { id, thumb: 'data:image/jpeg;base64,x', blob: new Blob([new Uint8Array(4)], { type: 'image/jpeg' }) };
}

function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe('ScannerComponent', () => {
  let conv: { convertFiles: ReturnType<typeof vi.fn> };
  let workspace: WorkspaceService;

  function configure(): void {
    conv = { convertFiles: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        { provide: ConversionService, useValue: conv },
        { provide: OcrService, useValue: { extract: vi.fn() } },
        { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn() } },
      ],
    });

    workspace = TestBed.inject(WorkspaceService);
  }

  function create() {
    const fixture = TestBed.createComponent(ScannerComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => configure());
  afterEach(() => vi.restoreAllMocks());

  describe('validazione dei file caricati', () => {
    it('rifiuta un formato non supportato senza aprire l\'editor', async () => {
      const component = create();
      const file = makeFile('doc.pdf', 'application/pdf', 100);

      await component.onFilesDropped({ length: 1, item: () => file, 0: file } as unknown as FileList);

      expect(component.editing()).toBe(false);
      expect(component.msg()).toContain('scanner.err_file_type');
    });

    it('rifiuta un file oltre il limite di dimensione', async () => {
      const component = create();
      const oversized = makeFile('scan.jpg', 'image/jpeg', 21 * 1024 * 1024);

      await component.onFilesDropped({ length: 1, item: () => oversized, 0: oversized } as unknown as FileList);

      expect(component.editing()).toBe(false);
      expect(component.msg()).toContain('scanner.err_file_too_large');
    });

    it('rifiuta il batch se non ci sono più posti liberi per nuove pagine', async () => {
      const component = create();
      component.pages.set(Array.from({ length: 20 }, (_, i) => page(i)));
      const files = [makeFile('a.jpg', 'image/jpeg', 100), makeFile('b.jpg', 'image/jpeg', 100)];
      const list = { length: 2, item: (i: number) => files[i], 0: files[0], 1: files[1] } as unknown as FileList;

      await component.onFilesDropped(list);

      expect(component.msg()).toContain('scanner.err_too_many_pages');
      expect(component.editing()).toBe(false);
    });
  });

  describe('conferma prima delle azioni distruttive', () => {
    it('non elimina la pagina se l\'utente annulla la conferma', () => {
      const component = create();
      component.pages.set([page(1), page(2)]);
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      component.remove(0);

      expect(component.pages().length).toBe(2);
    });

    it('elimina la pagina se l\'utente conferma', () => {
      const component = create();
      component.pages.set([page(1), page(2)]);
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      component.remove(0);

      expect(component.pages().length).toBe(1);
    });

    it('non svuota le pagine se l\'utente annulla la conferma', () => {
      const component = create();
      component.pages.set([page(1), page(2)]);
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      component.clearPages();

      expect(component.pages().length).toBe(2);
    });

    it('svuota le pagine se l\'utente conferma', () => {
      const component = create();
      component.pages.set([page(1), page(2)]);
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      component.clearPages();

      expect(component.pages().length).toBe(0);
    });
  });

  describe('esportazione PDF', () => {
    it('riporta la percentuale di avanzamento reale durante l\'upload', () => {
      const component = create();
      component.pages.set([page(1)]);
      conv.convertFiles.mockReturnValue(of(
        { type: HttpEventType.UploadProgress, loaded: 50, total: 100 },
        { type: HttpEventType.UploadProgress, loaded: 100, total: 100 },
        new HttpResponse({ body: new Blob(['x'], { type: 'application/pdf' }) }),
      ));

      component.exportPdf();

      expect(component.exportPct()).toBeNull();
      expect(component.msg()).toContain('scanner.success');
    });

    it('segnala un errore generico se l\'export fallisce online', () => {
      const component = create();
      component.pages.set([page(1)]);
      conv.convertFiles.mockReturnValue(throwError(() => new Error('boom')));

      component.exportPdf();

      expect(component.exporting()).toBe(false);
      expect(component.msg()).toContain('scanner.err_failed');
    });

    it('non tenta l\'export se il browser è offline', () => {
      const component = create();
      component.pages.set([page(1)]);
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

      component.exportPdf();

      expect(conv.convertFiles).not.toHaveBeenCalled();
      expect(component.msg()).toContain('scanner.err_offline');
    });

    it('invia il PDF esportato al Workspace', () => {
      const component = create();
      component.pages.set([page(1)]);
      conv.convertFiles.mockReturnValue(of(
        new HttpResponse({ body: new Blob(['x'], { type: 'application/pdf' }) }),
      ));
      component.exportPdf();

      component.sendPdfToWorkspace();

      expect(workspace.peek()?.fromTool).toBe('scanner');
      expect(workspace.peek()?.mime).toBe('application/pdf');
    });
  });

  describe('errori fotocamera', () => {
    async function withGetUserMediaError(name: string) {
      const component = create();
      const error = Object.assign(new Error('cam'), { name });
      if (!navigator.mediaDevices) {
        Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true });
      }
      vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockRejectedValue(error);
      await component.startCamera();
      return component;
    }

    it('distingue il permesso negato', async () => {
      const component = await withGetUserMediaError('NotAllowedError');
      expect(component.camError()).toContain('scanner.err_camera_denied');
    });

    it('distingue l\'assenza di fotocamera', async () => {
      const component = await withGetUserMediaError('NotFoundError');
      expect(component.camError()).toContain('scanner.err_camera_notfound');
    });

    it('distingue la fotocamera occupata', async () => {
      const component = await withGetUserMediaError('NotReadableError');
      expect(component.camError()).toContain('scanner.err_camera_inuse');
    });

    it('usa un messaggio generico per errori non riconosciuti', async () => {
      const component = await withGetUserMediaError('AbortError');
      expect(component.camError()).toContain('scanner.err_camera');
      expect(component.camError()).not.toContain('scanner.err_camera_');
    });
  });
});
