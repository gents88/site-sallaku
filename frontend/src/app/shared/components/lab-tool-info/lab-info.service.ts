import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { SITE_ORIGIN } from '../../../core/services/seo.service';
import { labIntent } from '../../../core/navigation/lab-intents';
import { labInfoKey } from './lab-info.data';

/** Pagina di uno strumento del Lab: lo strumento stesso o una pagina per ricerca specifica che lo riusa. */
export interface LabPage {
  /** Id della pagina: l'intento (merge-pdf) se la rotta ne ha uno per questo strumento, altrimenti lo strumento (pdf-editor). */
  id: string;
  intent: string | null;
  /** Chiavi i18n di title e description della pagina */
  titleKey: string;
  descriptionKey: string;
  /** H1 e sottotitolo propri della pagina per ricerca specifica; null per lo strumento (valgono i suoi). */
  headingKey: string | null;
  leadKey: string | null;
  /** Etichetta breve (briciole di pane) e testo del pulsante principale (solo pagine per ricerca specifica) */
  labelKey: string;
  ctaKey: string | null;
  /** Percorso senza prefisso di lingua: /lab/merge-pdf */
  path: string;
}

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
  private readonly router = inject(Router);

  /** Intento della rotta attiva (data.labIntent), se c'è e appartiene a `toolId`. */
  private activeIntent(toolId: string): string | null {
    try {
      let route = this.router.routerState?.snapshot?.root;
      while (route?.firstChild) route = route.firstChild;
      const id = route?.data?.['labIntent'];
      return typeof id === 'string' && labIntent(id)?.tool === toolId ? id : null;
    } catch {
      return null;
    }
  }

  /** Chiavi i18n e percorso della pagina corrente di uno strumento (una pagina per ricerca specifica o lo strumento stesso). */
  page(toolId: string): LabPage {
    return this.pageFor(this.activeIntent(toolId) ?? toolId);
  }

  /** Come page(), a partire dall'id della pagina (strumento o intento). */
  pageFor(pageId: string): LabPage {
    const key = labInfoKey(pageId);
    if (labIntent(pageId)) {
      return {
        id: pageId, intent: pageId,
        titleKey: `lab_intents.${key}.seo_title`, descriptionKey: `lab_intents.${key}.seo_description`,
        headingKey: `lab_intents.${key}.h1`, leadKey: `lab_intents.${key}.lead`,
        labelKey: `lab_intents.${key}.label`, ctaKey: `lab_intents.${key}.cta`,
        path: `/lab/${pageId}`,
      };
    }
    return {
      id: pageId, intent: null,
      titleKey: `${key}.seo_title`, descriptionKey: `${key}.seo_description`,
      headingKey: null, leadKey: null,
      labelKey: `sidebar.items.${key}`, ctaKey: null,
      path: `/lab/${pageId}`,
    };
  }

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
  appFields(pageId: string): { name: string; description: string; url: string; inLanguage: string; isAccessibleForFree: true } {
    const page = this.pageFor(pageId);
    const key = labInfoKey(pageId);
    const lang = this.lang.current();
    const pick = (path: string): string | null => {
      const v = this.t.instant(path);
      return typeof v === 'string' && v !== path ? v : null;
    };
    return {
      name: pick(page.titleKey) ?? pageId,
      // "A cosa serve" è un testo pulito; la meta description può contenere segnaposto (convertitore).
      description: pick(`lab_info.${key}.about`) ?? pick(page.descriptionKey) ?? '',
      url: `${SITE_ORIGIN}${withLangPrefix(page.path, lang)}`,
      inLanguage: lang,
      isAccessibleForFree: true,
    };
  }
}
