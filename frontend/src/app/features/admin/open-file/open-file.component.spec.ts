import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenFileComponent } from './open-file.component';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { LanguageService } from '../../../core/services/language.service';
import { SeoService } from '../../../core/services/seo.service';
import { TAKE_SHARED_FILES, WAIT_LAUNCH_FILES } from '../../../core/utils/shared-files';

function setup(query: Record<string, string>, opts: { shared?: () => Promise<File[]>; launch?: () => Promise<File[]>; lang?: 'it' | 'en' } = {}) {
  const lang = opts.lang ?? 'it';
  const take = vi.fn(opts.shared ?? (async () => []));
  const launch = vi.fn(opts.launch ?? (async () => []));
  const seo = { update: vi.fn() };
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      { provide: LanguageService, useValue: { current: () => lang } },
      { provide: SeoService, useValue: seo },
      { provide: TAKE_SHARED_FILES, useValue: take },
      { provide: WAIT_LAUNCH_FILES, useValue: launch },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const workspace = TestBed.inject(WorkspaceService);
  const fixture = TestBed.createComponent(OpenFileComponent);
  return { fixture, navigate, workspace, seo, take, launch };
}

describe('OpenFileComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('condivisione ricevuta: il file va nel workspace e si passa al Lab (senza lasciare questa pagina nella cronologia)', async () => {
    const file = new File(['%PDF'], 'relazione.pdf', { type: 'application/pdf' });
    const { fixture, navigate, workspace } = setup({ shared: '1' }, { shared: async () => [file] });

    await fixture.componentInstance.ngOnInit();

    expect(workspace.peek()).toMatchObject({ kind: 'file', filename: 'relazione.pdf', mime: 'application/pdf', fromTool: 'open-file', blob: file });
    expect(navigate).toHaveBeenCalledWith('/lab', { replaceUrl: true });
  });

  it('rispetta il prefisso lingua della sessione', async () => {
    const { fixture, navigate } = setup({ shared: '1' }, { shared: async () => [new File(['x'], 'a.pdf', { type: 'application/pdf' })], lang: 'en' });
    await fixture.componentInstance.ngOnInit();
    expect(navigate).toHaveBeenCalledWith('/en/lab', { replaceUrl: true });
  });

  it('con più file ne apre uno solo (il primo)', async () => {
    const { fixture, workspace } = setup({ shared: '2' }, {
      shared: async () => [new File(['1'], 'primo.pdf', { type: 'application/pdf' }), new File(['2'], 'secondo.pdf', { type: 'application/pdf' })],
    });
    await fixture.componentInstance.ngOnInit();
    expect(workspace.peek()?.filename).toBe('primo.pdf');
  });

  it('"Apri con": legge la launchQueue quando non c’è ?shared', async () => {
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    const { fixture, workspace, take, launch } = setup({}, { launch: async () => [file] });
    await fixture.componentInstance.ngOnInit();
    expect(take).not.toHaveBeenCalled();
    expect(launch).toHaveBeenCalledTimes(1);
    expect(workspace.peek()?.filename).toBe('doc.pdf');
  });

  it('nessun file ricevuto: resta sulla pagina con la spiegazione, senza toccare il workspace, e non è indicizzabile', async () => {
    const { fixture, navigate, workspace, seo } = setup({ shared: '0' });
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    expect(workspace.peek()).toBeNull();
    expect(fixture.componentInstance.state()).toBe('none');
    expect(fixture.nativeElement.querySelector('.open-file__cta')).not.toBeNull();
    expect(seo.update).toHaveBeenCalledWith(expect.objectContaining({ noindex: true }));
  });

  it('se la lettura della cache fallisce non resta appesa: mostra "nessun file"', async () => {
    const { fixture } = setup({ shared: '1' }, { shared: async () => { throw new Error('quota'); } });
    await fixture.componentInstance.ngOnInit();
    expect(fixture.componentInstance.state()).toBe('none');
  });
});
