import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SnackbarService {
  private container: HTMLElement | null = null;

  private ensureContainer() {
    if (this.container) return;
    this.container = document.createElement('div');
    this.container.style.position = 'fixed';
    this.container.style.right = '16px';
    this.container.style.bottom = '16px';
    this.container.style.zIndex = '9999';
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.gap = '8px';
    document.body.appendChild(this.container);
  }

  show(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 4000) {
    this.ensureContainer();
    const el = document.createElement('div');
    el.textContent = message;
    el.style.minWidth = '220px';
    el.style.padding = '10px 14px';
    el.style.borderRadius = '8px';
    el.style.boxShadow = '0 6px 18px rgba(2,6,23,0.45)';
    el.style.color = '#fff';
    el.style.fontWeight = '600';
    el.style.fontFamily = 'Inter, system-ui, sans-serif';
    el.style.opacity = '0';
    el.style.transition = 'opacity 180ms ease, transform 200ms ease';
    el.style.transform = 'translateY(6px)';

    if (type === 'success') {
      el.style.background = 'linear-gradient(90deg,#10b981,#06b6d4)';
    } else if (type === 'error') {
      el.style.background = 'linear-gradient(90deg,#ef4444,#fb923c)';
    } else {
      el.style.background = 'linear-gradient(90deg,#64748b,#94a3b8)';
    }

    this.container!.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });

    const timer = setTimeout(() => this.dismiss(el), duration);
    el.addEventListener('click', () => {
      clearTimeout(timer);
      this.dismiss(el);
    });
  }

  private dismiss(el: HTMLElement) {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 220);
  }
}
