import { HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { firstValueFrom, from, of, toArray } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { asUploadEvents, toUploadEvents } from './upload-events';

describe('toUploadEvents', () => {
  it('maps Sent → 0%, UploadProgress → %, 100% → processing, Response → done', async () => {
    const events = await firstValueFrom(
      from([
        { type: HttpEventType.Sent },
        { type: HttpEventType.UploadProgress, loaded: 25, total: 100 },
        { type: HttpEventType.UploadProgress, loaded: 100, total: 100 },
        { type: HttpEventType.ResponseHeader },
        new HttpResponse({ body: { ok: true } }),
      ] as never[]).pipe(toUploadEvents<{ ok: boolean }>(), toArray()),
    );
    expect(events).toEqual([
      { type: 'progress', percent: 0 },
      { type: 'progress', percent: 25 },
      { type: 'progress', percent: 100 },
      { type: 'processing' },
      { type: 'done', body: { ok: true } },
    ]);
  });

  it('reports an unknown percentage when the browser does not know the total', async () => {
    const events = await firstValueFrom(
      of({ type: HttpEventType.UploadProgress, loaded: 10 } as HttpEvent<unknown>).pipe(toUploadEvents(), toArray()),
    );
    expect(events).toEqual([{ type: 'progress', percent: null }]);
  });
});

describe('asUploadEvents', () => {
  it('wraps a plain body request as processing → done', async () => {
    const events = await firstValueFrom(of('x').pipe(asUploadEvents<string>(), toArray()));
    expect(events).toEqual([{ type: 'processing' }, { type: 'done', body: 'x' }]);
  });
});
