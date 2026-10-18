import { DestroyRef } from '@angular/core';
import { signal } from '@angular/core';
import { ActivatedRoute, Event, NavigationEnd, ParamMap, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { watchNewItemParam } from './new-item-param';

function setup(initial: Record<string, string> = {}, navigating = false) {
  const params = new BehaviorSubject<ParamMap>(convertToParamMap(initial));
  const route = { queryParamMap: params.asObservable() } as unknown as ActivatedRoute;
  const events = new Subject<Event>();
  const router = {
    navigate: vi.fn(() => Promise.resolve(true)),
    currentNavigation: signal(navigating ? {} : null),
    events,
  } as unknown as Router & { navigate: ReturnType<typeof vi.fn> };
  let destroy: () => void = () => undefined;
  const destroyRef = { onDestroy: (fn: () => void) => { destroy = fn; return () => undefined; } } as unknown as DestroyRef;
  const onNew = vi.fn();
  watchNewItemParam(route, router, destroyRef, onNew);
  return { params, router, onNew, events, destroy: () => destroy() };
}

describe('watchNewItemParam', () => {
  it('apre il form se la pagina si carica con ?new=1 e toglie il parametro dall\'URL', () => {
    const { router, onNew } = setup({ new: '1' });
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { new: null }, queryParamsHandling: 'merge', replaceUrl: true,
    }));
  });

  it('con una navigazione in corso toglie il parametro solo quando finisce (prima il router la scarterebbe)', () => {
    const { router, onNew, events } = setup({ new: '1' }, true);
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();

    events.next(new NavigationEnd(1, '/dashboard/blog?new=1', '/dashboard/blog?new=1'));
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('funziona anche con la pagina già aperta (il router riusa il componente)', () => {
    const { params, onNew } = setup({ status: 'draft' });
    expect(onNew).not.toHaveBeenCalled();

    params.next(convertToParamMap({ status: 'draft', new: '1' }));
    params.next(convertToParamMap({ status: 'draft' }));
    params.next(convertToParamMap({ new: '1' }));
    expect(onNew).toHaveBeenCalledTimes(2);
  });

  it('ignora valori diversi da 1 e smette di ascoltare quando il componente viene distrutto', () => {
    const { params, onNew, destroy } = setup();
    params.next(convertToParamMap({ new: 'true' }));
    destroy();
    params.next(convertToParamMap({ new: '1' }));
    expect(onNew).not.toHaveBeenCalled();
  });
});
