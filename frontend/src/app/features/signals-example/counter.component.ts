import { Component, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Componente di esempio che dimostra l'uso di Signals (Angular 16+).
 *
 * Signals forniscono reattività fine-grained senza RxJS, con:
 * - signal(): stato mutabile con .set() e .update()
 * - computed(): derivazioni automatiche che reagiscono ai segnali dipendenti
 * - effect(): esecuzione di effetti collaterali quando i segnali cambiano
 *
 * Vantaggi:
 * ✅ Change detection più efficiente
 * ✅ Sintassi più leggibile
 * ✅ No memory leaks (automatic cleanup)
 * ✅ Type-safe
 */
@Component({
  selector: 'app-counter',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './counter.component.html',
  styleUrls: ['./counter.component.scss'],
})
export class CounterComponent {
  // ===== SIGNALS =====

  count = signal<number>(0);
  step = signal<number>(1);
  name = signal<string>('Counter App');

  // ===== COMPUTED SIGNALS =====

  doubleCount = computed(() => this.count() * 2);

  squaredCount = computed(() => this.count() * this.count());

  status = computed(() => {
    const val = this.count();
    if (val === 0) return 'Neutro';
    if (val > 0) return '✓ Positivo';
    return '✗ Negativo';
  });

  statusClass = computed(() => {
    const val = this.count();
    if (val === 0) return 'neutral';
    if (val > 0) return 'positive';
    return 'negative';
  });

  isEven = computed(() => this.count() % 2 === 0);

  summary = computed(() => ({
    value: this.count(),
    doubled: this.doubleCount(),
    squared: this.squaredCount(),
    isPositive: this.count() > 0,
    isEven: this.isEven(),
  }));

  // ===== EFFECTS =====

  constructor() {
    // Effect che esegue quando 'count' cambia
    // Utile per side effects (log, analytics, update localStorage, etc.)
    effect(() => {
      const currentCount = this.count();
      console.log(`[EFFECT] Count changed to: ${currentCount}`);

      // Salva in localStorage
      localStorage.setItem('counter-value', String(currentCount));
    });

    // Effect che esegue quando 'summary' cambia
    effect(() => {
      const summary = this.summary();
      console.log('[EFFECT] Summary:', summary);
    });

    // Al caricamento, recupera il valore da localStorage
    const saved = localStorage.getItem('counter-value');
    if (saved) {
      this.count.set(Number(saved));
    }
  }

  // ===== METODI =====

  increment(): void {
    this.count.update(value => value + this.step());
  }

  decrement(): void {
    this.count.update(value => value - this.step());
  }

  reset(): void {
    this.count.set(0);
  }

  setStep(newStep: number): void {
    if (newStep > 0) {
      this.step.set(newStep);
    }
  }

  setName(newName: string): void {
    this.name.set(newName || 'Counter App');
  }

  // Metodo avanzato: aggiorna più segnali in sequenza
  resetAll(): void {
    this.count.set(0);
    this.step.set(1);
    this.name.set('Counter App');
  }
}
