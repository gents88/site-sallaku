import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { LabNextStepsComponent } from './lab-next-steps.component';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { LanguageService } from '../../../core/services/language.service';

@Component({ standalone: true, template: '' })
class Blank {}

async function setup(preexisting = false) {
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([{ path: '**', component: Blank }]),
      { provide: LanguageService, useValue: { current: signal('it') } },
    ],
  });
  const workspace = TestBed.inject(WorkspaceService);
  if (preexisting) workspace.send({ kind: 'file', filename: 'vecchio.pdf', mime: 'application/pdf', fromTool: 'viewer' });
  const fixture = TestBed.createComponent(LabNextStepsComponent);
  fixture.detectChanges();
  const render = () => { TestBed.tick(); fixture.detectChanges(); };
  return { workspace, fixture, render, el: fixture.nativeElement as HTMLElement, router: TestBed.inject(Router) };
}

describe('LabNextStepsComponent', () => {
  it('after an OCR result is sent, links to the tools that accept text', async () => {
    const { workspace, el, render } = await setup();
    workspace.send({ kind: 'text', text: 'ciao', filename: 'ocr-text.txt', fromTool: 'ocr' });
    render();
    const hrefs = Array.from(el.querySelectorAll('.next-steps__chip')).map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(['/lab/ai-formatter', '/lab/editor']);
  });

  it('caps PDF suggestions at four and never suggests the source tool', async () => {
    const { workspace, el, render } = await setup();
    workspace.send({ kind: 'file', filename: 'a.pdf', mime: 'application/pdf', fromTool: 'pdf-summary' });
    render();
    const hrefs = Array.from(el.querySelectorAll('.next-steps__chip')).map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(['/lab/pdf-translate', '/lab/ocr', '/lab/pdf-editor', '/lab/viewer']);
  });

  it('ignores an item that was already in the workspace when the page loaded', async () => {
    const { el, render } = await setup(true);
    render();
    expect(el.querySelector('.next-steps')).toBeNull();
  });

  it('closes on dismiss and on the next navigation', async () => {
    const { workspace, el, render, fixture, router } = await setup();
    workspace.send({ kind: 'text', text: 'x', filename: 't.txt', fromTool: 'editor' });
    render();
    expect(el.querySelector('.next-steps')).not.toBeNull();
    fixture.componentInstance.dismiss();
    render();
    expect(el.querySelector('.next-steps')).toBeNull();

    workspace.send({ kind: 'text', text: 'y', filename: 'u.txt', fromTool: 'editor' });
    render();
    expect(el.querySelector('.next-steps')).not.toBeNull();
    await router.navigateByUrl('/lab/ai-formatter');
    render();
    expect(el.querySelector('.next-steps')).toBeNull();
  });

  it('stays hidden on the /lab page, which shows the same suggestions inline', async () => {
    const { workspace, el, render, router } = await setup();
    await router.navigateByUrl('/en/lab');
    workspace.send({ kind: 'file', filename: 'a.pdf', mime: 'application/pdf', fromTool: 'lab' });
    render();
    expect(el.querySelector('.next-steps')).toBeNull();
  });
});
