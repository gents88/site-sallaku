import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationCancel, NavigationEnd, NavigationError, Router } from '@angular/router';
import { filter, take } from 'rxjs';

/**
 * `?new=1` (palette Ctrl+K, "+" della sidebar) apre il form di creazione.
 *
 * Si ascoltano i query param invece di leggere lo snapshot: col "+" sempre a
 * portata nella sidebar ci si arriva anche stando già sulla pagina, e il
 * router riusa il componente senza rifare ngOnInit. Il parametro poi sparisce
 * dall'URL (replaceUrl), altrimenti ogni refresh riaprirebbe il form.
 * La pulizia aspetta la fine della navigazione che ha portato `?new=1`: mentre
 * è in corso il router calcola il "merge" sull'URL precedente, ottiene lo
 * stesso URL di partenza e la scarta, e il parametro restava.
 *
 * `onNew` decide se aprire davvero: con un form aperto e modificato deve
 * chiedere conferma, perché cambiare solo i query param non passa dalla
 * guardia delle modifiche non salvate.
 */
export function watchNewItemParam(route: ActivatedRoute, router: Router, destroyRef: DestroyRef, onNew: () => void): void {
  route.queryParamMap
    .pipe(
      filter(params => params.get('new') === '1'),
      takeUntilDestroyed(destroyRef),
    )
    .subscribe(() => {
      const clear = () =>
        void router.navigate([], { relativeTo: route, queryParams: { new: null }, queryParamsHandling: 'merge', replaceUrl: true });
      if (router.currentNavigation()) {
        router.events
          .pipe(
            filter(e => e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError),
            take(1),
          )
          .subscribe(clear);
      } else {
        clear();
      }
      onNew();
    });
}
