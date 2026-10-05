import { Component, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { LAB_RECENT_KEY, LAB_RECENT_MAX, LabActivityService } from './lab-activity.service';

@Component({ standalone: true, template: '' })
class Blank {}

function setup(platform: 'browser' | 'server' = 'browser') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'lab', component: Blank }, { path: 'lab/:tool', component: Blank }, { path: ':lang/lab/:tool', component: Blank }]),
      { provide: PLATFORM_ID, useValue: platform },
    ],
  });
  return { svc: TestBed.inject(LabActivityService), router: TestBed.inject(Router) };
}

describe('LabActivityService', () => {
  beforeEach(() => localStorage.clear());

  it('records the tools opened, most recent first and without duplicates', async () => {
    const { svc, router } = setup();
    await router.navigateByUrl('/lab');
    await router.navigateByUrl('/lab/ocr');
    await router.navigateByUrl('/en/lab/pdf-translate');
    await router.navigateByUrl('/lab/ocr');
    expect(svc.recent().map(t => t.id)).toEqual(['ocr', 'pdf-translate']);
    expect(JSON.parse(localStorage.getItem(LAB_RECENT_KEY)!).map((t: { id: string }) => t.id)).toEqual(['ocr', 'pdf-translate']);
  });

  it(`keeps the last ${LAB_RECENT_MAX}`, () => {
    const { svc } = setup();
    ['ocr', 'viewer', 'editor', 'convert', 'pdf-summary'].forEach(id => svc.record(id));
    expect(svc.recent().map(t => t.id)).toEqual(['pdf-summary', 'convert', 'editor', 'viewer']);
  });

  it('restores the saved list and ignores garbage', () => {
    localStorage.setItem(LAB_RECENT_KEY, JSON.stringify([{ id: 'ocr', usedAt: 1 }, { id: 2 }, 'x']));
    expect(setup().svc.recent().map(t => t.id)).toEqual(['ocr']);
    TestBed.resetTestingModule();
    localStorage.setItem(LAB_RECENT_KEY, 'not json');
    expect(setup().svc.recent()).toEqual([]);
  });

  it('does not read storage while prerendering', () => {
    localStorage.setItem(LAB_RECENT_KEY, JSON.stringify([{ id: 'ocr', usedAt: 1 }]));
    expect(setup('server').svc.recent()).toEqual([]);
  });
});
