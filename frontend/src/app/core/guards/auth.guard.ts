import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const decide = () => (auth.isLoggedIn() && auth.isAdmin() ? true : router.createUrlTree(['/dashboard/login']));

  // Modalità cookie: al caricamento la sessione si sta ancora riprendendo dal
  // refresh token httpOnly — si aspetta l'esito invece di rimandare al login.
  if (auth.restoring()) {
    return toObservable(auth.restoring).pipe(filter(r => !r), take(1), map(decide));
  }
  return decide();
};
