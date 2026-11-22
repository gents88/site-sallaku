import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { DashboardCardComponent } from './dashboard-card.component';

@Component({
  standalone: true,
  imports: [DashboardCardComponent],
  template: `
    <app-dashboard-card titleKey="admin.top_pages" descKey="admin.top_pages_desc" icon="pages" periodKey="dashboard_ux.period_all_time" [wide]="true">
      <button cardAction type="button">azione</button>
      <p class="body">contenuto</p>
    </app-dashboard-card>
  `,
})
class HostComponent {}

describe('DashboardCardComponent', () => {
  it('mostra titolo, descrizione, periodo, azione e contenuto', () => {
    TestBed.configureTestingModule({ imports: [HostComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h2')?.textContent).toContain('admin.top_pages');
    expect(el.querySelector('.analytics-card__heading p')?.textContent).toContain('admin.top_pages_desc');
    expect(el.querySelector('.analytics-card__period')?.textContent).toContain('dashboard_ux.period_all_time');
    expect(el.querySelector('.analytics-card__aside button')?.textContent).toContain('azione');
    expect(el.querySelector('.body')?.textContent).toContain('contenuto');
    expect(el.querySelector('app-dashboard-card')?.classList).toContain('dashboard-card--wide');
  });

  it('senza periodo né descrizione non mostra quegli elementi', () => {
    TestBed.configureTestingModule({ imports: [DashboardCardComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(DashboardCardComponent);
    fixture.componentRef.setInput('titleKey', 'x');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.analytics-card__period')).toBeNull();
    expect(el.querySelector('.analytics-card__heading p')).toBeNull();
  });
});
