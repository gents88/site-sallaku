import { Pipe, PipeTransform } from '@angular/core';

export type LocalDateStyle = 'short' | 'long';

const OPTIONS: Record<LocalDateStyle, Intl.DateTimeFormatOptions> = {
  short: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
};

/**
 * Data nella lingua del sito: `{{ post.publishedAt | localDate: lang() }}`.
 *
 * Il DatePipe di Angular usa LOCALE_ID, che qui è sempre en-US (nessun
 * locale registrato): le pagine italiane mostravano "Aug 15, 2026". Intl
 * ha già tutte le lingue nel browser e in Node (prerender), senza caricare
 * dati di locale nel bundle. La lingua è un argomento, così la pipe resta pura.
 */
@Pipe({ name: 'localDate', standalone: true })
export class LocalDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined, lang: string, style: LocalDateStyle = 'short'): string {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat(lang, OPTIONS[style]).format(date);
    } catch {
      return new Intl.DateTimeFormat('it', OPTIONS[style]).format(date);
    }
  }
}
