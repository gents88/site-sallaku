import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AcquisitionSectionComponent } from './acquisition-section.component';
import { AdminDashboardService } from '../../admin-dashboard.service';

describe('AcquisitionSectionComponent', () => {
  it('contiene i pannelli provenienza e contatti; reload li ricarica entrambi', () => {
    const getAcquisition = vi.fn(() => of({ days: 30, totalEntries: 0, previousTotalEntries: 0, sources: [], referrers: [], entryPages: [], recentVisits: [] }));
    const getLeadAttribution = vi.fn(() => of({ days: 30, totalLeads: 0, previousTotalLeads: 0, byKind: [], bySource: [], byReferrer: [], byEntryPage: [], articles: [] }));
    TestBed.configureTestingModule({
      imports: [AcquisitionSectionComponent, TranslateModule.forRoot()],
      providers: [{ provide: AdminDashboardService, useValue: { getAcquisition, getLeadAttribution } }],
    });
    const fixture = TestBed.createComponent(AcquisitionSectionComponent);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-acquisition-panel')).not.toBeNull();
    expect(el.querySelector('app-lead-attribution-panel')).not.toBeNull();
    expect(getAcquisition).toHaveBeenCalledTimes(1);
    fixture.componentInstance.reload();
    expect(getAcquisition).toHaveBeenCalledTimes(2);
    expect(getLeadAttribution).toHaveBeenCalledTimes(2);
  });
});
