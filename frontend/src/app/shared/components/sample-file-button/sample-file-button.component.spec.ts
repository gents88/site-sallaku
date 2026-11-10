import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SampleFileButtonComponent, toFileList } from './sample-file-button.component';
import { SnackbarService } from '../../../core/services/snackbar.service';

function setup() {
  const snackbar = { show: vi.fn() };
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [{ provide: SnackbarService, useValue: snackbar }],
  });
  const fixture = TestBed.createComponent(SampleFileButtonComponent);
  fixture.detectChanges();
  const picked = vi.fn();
  fixture.componentInstance.picked.subscribe(picked);
  return { fixture, picked, snackbar, button: fixture.nativeElement.querySelector('button') as HTMLButtonElement };
}

describe('SampleFileButtonComponent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('scarica il PDF d’esempio ed emette un FileList con quel file', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(['%PDF-1.4'], { type: 'application/pdf' })));
    vi.stubGlobal('fetch', fetchMock);
    const { fixture, picked } = setup();

    await fixture.componentInstance.pick();

    expect(fetchMock).toHaveBeenCalledWith('/assets/samples/esempio.pdf');
    expect(picked).toHaveBeenCalledTimes(1);
    const files = picked.mock.calls[0][0] as FileList;
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('esempio.pdf');
    expect(files[0].type).toBe('application/pdf');
  });

  it('se il download fallisce non emette nulla e avvisa l’utente', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 404 })));
    const { fixture, picked, snackbar } = setup();

    await fixture.componentInstance.pick();

    expect(picked).not.toHaveBeenCalled();
    expect(snackbar.show).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('durante il caricamento il pulsante è disabilitato, poi si riabilita', async () => {
    let release!: (r: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((r) => (release = r))));
    const { fixture, button } = setup();

    const pending = fixture.componentInstance.pick();
    fixture.detectChanges();
    expect(button.disabled).toBe(true);

    release(new Response(new Blob(['x'])));
    await pending;
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
  });
});

describe('toFileList', () => {
  it('produce un elenco con un solo file, leggibile come lo leggono i tool (files[0], Array.from)', () => {
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    const list = toFileList(file);
    expect(list.length).toBe(1);
    expect(list[0]).toBe(file);
    expect(Array.from(list)).toEqual([file]);
  });

  it('senza DataTransfer (ambienti vecchi) ripiega su un array-like equivalente', () => {
    vi.stubGlobal('DataTransfer', undefined);
    const file = new File(['x'], 'a.pdf');
    const list = toFileList(file);
    expect(list[0]).toBe(file);
    expect(list.item(0)).toBe(file);
    expect(list.item(1)).toBeNull();
    vi.unstubAllGlobals();
  });
});
