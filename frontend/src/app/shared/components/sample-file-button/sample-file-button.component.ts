import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SnackbarService } from '../../../core/services/snackbar.service';

const SAMPLE = { url: '/assets/samples/esempio.pdf', name: 'esempio.pdf', type: 'application/pdf' };

/**
 * Incapsula un File in un FileList, la forma che tutti i tool già ricevono da
 * `(filesDropped)`: così il file d'esempio passa dallo stesso percorso di un
 * file trascinato (validazione, limiti, anteprima) senza codice dedicato.
 */
export function toFileList(file: File): FileList {
  if (typeof DataTransfer !== 'undefined') {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt.files;
  }
  return Object.assign([file], { item: (i: number) => (i === 0 ? file : null) }) as unknown as FileList;
}

/**
 * "Prova con un file di esempio": chi arriva su un tool senza un documento
 * pronto può vedere subito cosa fa, invece di abbandonare la pagina.
 */
@Component({
  selector: 'app-sample-file-button',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="sfb" (click)="pick()" [disabled]="loading()">
      <span aria-hidden="true">✨</span>
      {{ (loading() ? 'sample.loading' : 'sample.try') | translate }}
    </button>
  `,
  styles: [`
    :host { display: block; text-align: center; margin: .6rem 0; }
    .sfb {
      font: inherit; font-size: .88rem; cursor: pointer; padding: .4rem .9rem; border-radius: 999px;
      color: var(--color-primary, #8b5cf6); background: transparent;
      border: 1px dashed var(--color-primary, #8b5cf6);
    }
    .sfb:hover:not(:disabled) { background: rgba(139, 92, 246, .1); }
    .sfb:disabled { opacity: .6; cursor: progress; }
  `],
})
export class SampleFileButtonComponent {
  private readonly snackbar = inject(SnackbarService);
  private readonly translate = inject(TranslateService);

  /** Stessa forma di `(filesDropped)`: collegarlo all'handler di drop del tool. */
  @Output() picked = new EventEmitter<FileList>();

  readonly loading = signal(false);

  async pick(): Promise<void> {
    const sample = SAMPLE;
    this.loading.set(true);
    try {
      const res = await fetch(sample.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // arrayBuffer e non blob(): vedi takeSharedFiles (Blob di Response e File non sempre compatibili).
      const bytes = await res.arrayBuffer();
      this.picked.emit(toFileList(new File([bytes], sample.name, { type: sample.type })));
    } catch {
      this.snackbar.show(this.translate.instant('sample.error') as string, 'error');
    } finally {
      this.loading.set(false);
    }
  }
}
