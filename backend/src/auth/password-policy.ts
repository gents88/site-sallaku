import { BadRequestException } from '@nestjs/common';

/**
 * Regola unica per le password: registrazione pubblica e password impostate
 * dall'admin (creazione/reset utente). Max 72 perché bcrypt tronca oltre.
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
export const PASSWORD_MESSAGE =
  'Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character';
/** Stesso costo usato dalla registrazione. */
export const PASSWORD_BCRYPT_ROUNDS = 12;

/**
 * Un account admin accede a tutto (utenti, contatti, chat live, contenuti): password più lunga.
 * Vale per quelle impostate dall'admin; ADMIN_PASSWORD dell'ambiente non blocca l'avvio, ma
 * AdminBootstrapService segnala nel log se è sotto la soglia.
 */
export const ADMIN_PASSWORD_MIN = 12;

export function assertPasswordForRole(role: string, password: string): void {
  if (role === 'admin' && password.length < ADMIN_PASSWORD_MIN) {
    throw new BadRequestException(`Admin passwords must be at least ${ADMIN_PASSWORD_MIN} characters long`);
  }
}
