import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription, concatMap, from, map, toArray } from 'rxjs';
import { BlogService } from '../../../core/services/blog.service';
import { Lang, NON_DEFAULT_LANGS } from '../../../core/services/language.service';

export interface TranslatableField {
  key: string;
  labelKey: string;
  multiline?: boolean;
}

export type TranslationsValue = Partial<Record<Exclude<Lang, 'it'>, Record<string, string>>>;

/**
 * Toglie lingue e campi vuoti prima del salvataggio: il backend rifiuta
 * chiavi inattese, e un campo vuoto deve ricadere sull'italiano invece di
 * sovrascriverlo con una stringa vuota.
 */
export function compactTranslations<T = TranslationsValue>(value: TranslationsValue): T {
  const out: Record<string, Record<string, string>> = {};
  for (const [lang, fields] of Object.entries(value)) {
    const kept = Object.fromEntries(
      Object.entries(fields ?? {}).filter(([, v]) => v?.trim()).map(([k, v]) => [k, v.trim()]),
    );
    if (Object.keys(kept).length) out[lang] = kept;
  }
  return out as T;
}

/**
 * Editor delle traduzioni di un contenuto (progetti, esperienze): una scheda
 * per lingua, i campi testuali e un pulsante che traduce automaticamente i
 * soli campi vuoti partendo dall'italiano (stesso endpoint admin del blog).
 * I campi lasciati vuoti ricadono sull'italiano nel sito pubblico.
 */
@Component({
  selector: 'app-translations-editor',
  standalone: true,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="te">
      <legend>{{ 'translations_editor.title' | translate }}</legend>
      <p class="te__hint">{{ 'translations_editor.hint' | translate }}</p>

      <div class="te__tabs" role="tablist">
        @for (lang of langs; track lang) {
          <button type="button" role="tab" class="te__tab"
                  [class.active]="active() === lang" [attr.aria-selected]="active() === lang"
                  (click)="active.set(lang)">
            {{ lang.toUpperCase() }}
            <span class="te__count">{{ filledCount(lang) }}/{{ fields().length }}</span>
          </button>
        }
      </div>

      <div role="tabpanel">
        @for (field of fields(); track field.key) {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ field.labelKey | translate }} ({{ active().toUpperCase() }})</mat-label>
            @if (field.multiline) {
              <textarea matInput rows="3" [ngModel]="fieldValue(active(), field.key)" (ngModelChange)="setField(active(), field.key, $event)"
                        [placeholder]="source()[field.key] || ''"></textarea>
            } @else {
              <input matInput [ngModel]="fieldValue(active(), field.key)" (ngModelChange)="setField(active(), field.key, $event)"
                     [placeholder]="source()[field.key] || ''" />
            }
          </mat-form-field>
        }

        <div class="te__actions">
          <button type="button" class="btn btn-sm" (click)="autoTranslate(active())" [disabled]="translating() || !canAutoTranslate(active())">
            {{ (translating() ? 'translations_editor.translating' : 'translations_editor.auto') | translate }}
          </button>
          @if (error()) { <span class="te__error" role="alert">{{ 'translations_editor.error' | translate }}</span> }
        </div>
      </div>
    </fieldset>
  `,
  styles: [`
    .te { border: 1px solid var(--border-color); border-radius: var(--radius-md, 12px); padding: 1rem 1.25rem; margin: 1rem 0; }
    legend { padding: 0 .4rem; font-weight: 600; }
    .te__hint { font-size: .82rem; color: var(--text-secondary); margin: 0 0 .75rem; }
    .te__tabs { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: 1rem; }
    .te__tab {
      border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary);
      border-radius: 999px; padding: .3rem .75rem; cursor: pointer; font-size: .82rem; display: inline-flex; gap: .4rem;
      &.active { background: rgba(79, 106, 245, .15); color: var(--text-primary); border-color: rgba(79, 106, 245, .5); }
      &:focus-visible { outline: 2px solid var(--primary-500, #4f6af5); outline-offset: 2px; }
    }
    .te__count { opacity: .7; }
    .te__actions { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
    .te__error { color: var(--color-danger, #ef4444); font-size: .85rem; }
  `],
})
export class TranslationsEditorComponent {
  readonly fields = input.required<TranslatableField[]>();
  /** Valori italiani correnti del form: sorgente della traduzione automatica e placeholder. */
  readonly source = input<Record<string, string>>({});
  readonly translations = model<TranslationsValue>({});

  readonly langs = NON_DEFAULT_LANGS as Exclude<Lang, 'it'>[];
  readonly active = signal<Exclude<Lang, 'it'>>('en');
  readonly translating = signal(false);
  readonly error = signal(false);

  private readonly blog = inject(BlogService);
  private sub: Subscription | null = null;

  readonly filled = computed(() => this.translations());

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  fieldValue(lang: Exclude<Lang, 'it'>, key: string): string {
    return this.translations()[lang]?.[key] ?? '';
  }

  filledCount(lang: Exclude<Lang, 'it'>): number {
    const tr = this.filled()[lang] ?? {};
    return this.fields().filter(f => tr[f.key]?.trim()).length;
  }

  setField(lang: Exclude<Lang, 'it'>, key: string, value: string): void {
    this.translations.update(all => ({ ...all, [lang]: { ...(all[lang] ?? {}), [key]: value } }));
  }

  /** Campi vuoti in questa lingua che hanno un testo italiano da cui partire. */
  private missing(lang: Exclude<Lang, 'it'>): TranslatableField[] {
    return this.fields().filter(f => !this.fieldValue(lang, f.key).trim() && this.source()[f.key]?.trim());
  }

  canAutoTranslate(lang: Exclude<Lang, 'it'>): boolean {
    return this.missing(lang).length > 0;
  }

  autoTranslate(lang: Exclude<Lang, 'it'>): void {
    const todo = this.missing(lang);
    if (!todo.length) return;
    this.translating.set(true);
    this.error.set(false);
    // In sequenza: il servizio di traduzione ha un rate limit per IP.
    this.sub = from(todo).pipe(
      concatMap(f => this.blog.translateText(this.source()[f.key], 'it', lang).pipe(map(text => ({ key: f.key, text })))),
      toArray(),
    ).subscribe({
      next: results => {
        for (const r of results) this.setField(lang, r.key, r.text);
        this.translating.set(false);
      },
      error: () => {
        this.error.set(true);
        this.translating.set(false);
      },
    });
  }
}
