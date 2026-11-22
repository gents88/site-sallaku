import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { SITE_ORIGIN } from '../../../core/services/seo.service';
import { labInfoKey } from './lab-info.data';

/**
 * Dati strutturati della pagina di uno strumento a partire dagli stessi testi
 * che la pagina mostra. Google chiede che il contenuto di una FAQPage sia
 * visibile: prima le FAQ stavano solo nel JSON-LD, in inglese, anche sulle
 * pagine in italiano o albanese. `SeoService.injectJsonLd` sostituisce tutti i
 * JSON-LD presenti, quindi lo schema va incluso nell'elenco che ogni strumento
 * passa in un'unica chiamata.
 */
@Injectable({ providedIn: 'root' })
export class LabInfoService {
  private readonly t = inject(TranslateService);
  private readonly lang = inject(LanguageService);

  /** FAQPage nella lingua corrente, o null se lo strumento non ha FAQ. */
  faqSchema(toolId: string): object | null {
    const key = `lab_info.${labInfoKey(toolId)}.faq`;
    const faqs = this.t.instant(key);
    if (!Array.isArray(faqs)) return null;
    const valid = faqs.filter((f): f is { q: string; a: string } => !!f?.q && !!f?.a);
    if (!valid.length) return null;
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: valid.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    };
  }

  /** Come faqSchema, ma come elenco (vuoto o con un elemento): si usa con lo spread nell'array di injectJsonLd. */
  faqSchemas(toolId: string): object[] {
    const schema = this.faqSchema(toolId);
    return schema ? [schema] : [];
  }

  /**
   * Campi del `WebApplication` che devono coincidere con la pagina: nome e descrizione
   * nella lingua corrente, URL con il prefisso di lingua (prima era sempre quello
   * italiano, anche su /en e /de) e `inLanguage`. Si inserisce con lo spread in fondo
   * all'oggetto dello strumento, così sostituisce i valori scritti a mano.
   */
  appFields(toolId: string): { name: string; description: string; url: string; inLanguage: string; isAccessibleForFree: true } {
    const key = labInfoKey(toolId);
    const lang = this.lang.current();
    const pick = (path: string): string | null => {
      const v = this.t.instant(path);
      return typeof v === 'string' && v !== path ? v : null;
    };
    return {
      name: pick(`${key}.seo_title`) ?? toolId,
      // "A cosa serve" è un testo pulito; la meta description può contenere segnaposto (convertitore).
      description: pick(`lab_info.${key}.about`) ?? pick(`${key}.seo_description`) ?? '',
      url: `${SITE_ORIGIN}${withLangPrefix(`/lab/${toolId}`, lang)}`,
      inLanguage: lang,
      isAccessibleForFree: true,
    };
  }
}
