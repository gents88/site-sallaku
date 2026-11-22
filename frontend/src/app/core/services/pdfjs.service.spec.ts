import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PdfjsService } from './pdfjs.service';

type Internals = {
  renderToCanvas: (page: unknown, scale: number) => Promise<HTMLCanvasElement>;
  isBlank: (canvas: HTMLCanvasElement) => boolean;
};

function fakeCanvas(): HTMLCanvasElement {
  return { width: 100, height: 100, toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['x'])) } as unknown as HTMLCanvasElement;
}
const page = { getViewport: () => ({ width: 1000, height: 1000 }) } as never;

describe('PdfjsService.renderPageToBlob — pagine bianche', () => {
  function setup(blankResults: boolean[]) {
    const service = TestBed.inject(PdfjsService);
    const internals = service as unknown as Internals;
    const scales: number[] = [];
    const canvases: HTMLCanvasElement[] = [];
    vi.spyOn(internals, 'renderToCanvas').mockImplementation(async (_p, scale) => {
      scales.push(scale);
      const c = fakeCanvas();
      canvases.push(c);
      return c;
    });
    let i = 0;
    vi.spyOn(internals, 'isBlank').mockImplementation(() => blankResults[Math.min(i++, blankResults.length - 1)]);
    return { service, scales, canvases };
  }

  it('se la pagina è bianca riprova a risoluzione dimezzata e libera il canvas scartato', async () => {
    const { service, scales, canvases } = setup([true, false, false]);
    const onBlank = vi.fn();
    await service.renderPageToBlob(page, 1, { retryIfBlank: true, onBlank });
    expect(scales).toEqual([1, 0.5]);
    expect(canvases[0].width).toBe(0);
    expect(onBlank).not.toHaveBeenCalled();
  });

  it('riprova al massimo due volte, poi segnala la pagina come bianca', async () => {
    const { service, scales } = setup([true]);
    const onBlank = vi.fn();
    await service.renderPageToBlob(page, 2, { retryIfBlank: true, onBlank });
    expect(scales).toEqual([2, 1, 0.5]);
    expect(onBlank).toHaveBeenCalledTimes(1);
  });

  it('senza retryIfBlank non riprova', async () => {
    const { service, scales } = setup([true]);
    await service.renderPageToBlob(page, 2);
    expect(scales).toEqual([2]);
  });

  it('una pagina con contenuto non riprova e non segnala nulla', async () => {
    const { service, scales } = setup([false]);
    const onBlank = vi.fn();
    await service.renderPageToBlob(page, 2, { retryIfBlank: true, onBlank });
    expect(scales).toEqual([2]);
    expect(onBlank).not.toHaveBeenCalled();
  });
});
