import { BUILD_INFO } from '../utils/build-info';

/**
 * Versione nell'URL invece di enforceLoading: quello aggiungeva
 * ?enforceLoading=<Date.now()>, un URL nuovo a ogni visita, quindi i 122 KB
 * (36 KB gzip) di it.json non venivano mai serviti dalla cache del browser
 * nonostante Cache-Control: max-age=86400. Col commit nell'URL la cache vale
 * dentro una release e un nuovo deploy cambia URL, quindi nessuna traduzione
 * vecchia.
 */
export const TRANSLATE_LOADER_OPTIONS = {
  prefix: '/i18n/',
  suffix: `.json?v=${encodeURIComponent(BUILD_INFO.commit)}`,
};

/** URL esatto con cui il loader richiede le traduzioni di `lang`. */
export function translationUrl(lang: string): string {
  return `${TRANSLATE_LOADER_OPTIONS.prefix}${lang}${TRANSLATE_LOADER_OPTIONS.suffix}`;
}
