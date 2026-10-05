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
