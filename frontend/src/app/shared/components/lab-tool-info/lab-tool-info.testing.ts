import { Component, input } from '@angular/core';

/**
 * Sostituto di LabToolInfoComponent per le specifiche degli strumenti che non ne
 * verificano il contenuto e usano un Router finto (il vero richiede RouterLink).
 * Uso: TestBed.overrideComponent(X, { remove: { imports: [LabToolInfoComponent] }, add: { imports: [LabToolInfoStubComponent] } }).
 */
@Component({ selector: 'app-lab-tool-info', standalone: true, template: '' })
export class LabToolInfoStubComponent {
  readonly tool = input<string>('');
}
