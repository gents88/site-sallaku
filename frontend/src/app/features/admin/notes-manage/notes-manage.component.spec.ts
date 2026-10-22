import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { NotesManageComponent } from './notes-manage.component';
import { NotesAdminService } from '../../../core/services/notes-admin.service';

function setup(status: string | null) {
  const list = vi.fn(() => of({ data: [], total: 0 }));
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: NotesAdminService, useValue: { list } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(status ? { status } : {}) } } },
    ],
  });
  const fixture = TestBed.createComponent(NotesManageComponent);
  fixture.detectChanges();
  return { c: fixture.componentInstance, list };
}

describe('NotesManageComponent — scheda iniziale', () => {
  it('parte dalle note da moderare', () => {
    const { c, list } = setup(null);
    expect(c.status).toBe('pending');
    expect(list).toHaveBeenCalledWith('pending', 50, 0);
  });

  it('?status= (link dalla palette Ctrl+K) apre la scheda in cui si trova la nota', () => {
    const { c, list } = setup('spam');
    expect(c.status).toBe('spam');
    expect(list).toHaveBeenCalledWith('spam', 50, 0);
  });

  it('un valore sconosciuto torna alle note da moderare', () => {
    expect(setup('cestino').c.status).toBe('pending');
  });
});
