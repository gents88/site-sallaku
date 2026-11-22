import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../core/services/language.service';
import { LangUrlPipe } from '../../pipes/lang-url.pipe';
import { labInfoKey, relatedLabArticles, relatedLabTools } from './lab-info.data';

/** Domanda e risposta delle FAQ visibili. */
export interface LabFaq {
  q: string;
  a: string;
}

/**
 * Contenuto sotto l'interfaccia di uno strumento del Lab: a cosa serve, come si
 * usa, privacy, limiti, domande frequenti e collegamenti a strumenti e articoli
 * correlati. Senza questo le pagine degli strumenti avevano 40–60 parole
 * visibili: per Google erano pagine vuote, per chi arriva da una ricerca non
 * spiegavano nulla. I testi stanno in i18n (`lab_info.<strumento>`); le sezioni
 * senza testo non vengono mostrate.
 */
@Component({
  selector: 'app-lab-tool-info',
  standalone: true,
  imports: [RouterLink, TranslateModule, LangUrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lab-tool-info.component.html',
  styleUrls: ['./lab-tool-info.component.scss'],
})
export class LabToolInfoComponent {
  private readonly t = inject(TranslateService);
  private readonly lang = inject(LanguageService);

  /** Id dello strumento nel registro di navigazione (ocr, pdf-editor…) */
  readonly tool = input.required<string>();

  private readonly key = computed(() => `lab_info.${labInfoKey(this.tool())}`);

  /** Rilegge i testi al cambio lingua (il segnale `current` fa ricalcolare i computed). */
  private text<T>(field: string): T | null {
    this.lang.current();
    const value = this.t.instant(`${this.key()}.${field}`);
    // ngx-translate restituisce la chiave stessa quando manca: va trattata come "assente".
    return value === `${this.key()}.${field}` ? null : (value as T);
  }

  readonly about = computed(() => this.text<string>('about'));
  readonly steps = computed(() => (this.text<string[]>('steps') ?? []).filter(Boolean));
  readonly privacy = computed(() => this.text<string>('privacy'));
  readonly limits = computed(() => this.text<string>('limits'));
  readonly faqs = computed(() => (this.text<LabFaq[]>('faq') ?? []).filter(f => f?.q && f?.a));

  readonly relatedTools = computed(() => relatedLabTools(this.tool()));
  readonly relatedArticles = computed(() => relatedLabArticles(this.tool(), this.lang.current()));

  readonly hasContent = computed(
    () => !!(this.about() || this.steps().length || this.privacy() || this.limits() || this.faqs().length || this.relatedTools().length || this.relatedArticles().length),
  );
}
