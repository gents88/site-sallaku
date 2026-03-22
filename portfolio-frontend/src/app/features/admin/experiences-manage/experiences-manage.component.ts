import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { MatChipInputEvent } from '@angular/material/chips';
import { finalize, timeout } from 'rxjs';
import { ExperiencesService } from '../../../core/services/experiences.service';
import { Experience } from '../../../core/models/experience.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-experiences-manage',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule,
    MatCheckboxModule, MatSnackBarModule, MatChipsModule, LoadingSpinnerComponent,
  ],
  templateUrl: './experiences-manage.component.html',
  styleUrls: ['./experiences-manage.component.scss'],
})
export class ExperiencesManageComponent implements OnInit {
  experiences: Experience[] = [];
  loading = true;
  showForm = false;
  editingId: string | null = null;
  saving = false;
  separatorKeys = [ENTER, COMMA];
  technologies: string[] = [];

  form = this.fb.group({
    company:     ['', Validators.required],
    role:        ['', Validators.required],
    startDate:   ['', Validators.required],
    endDate:     [''],
    current:     [false],
    description: ['', Validators.required],
    location:    [''],
    order:       [0],
  });

  constructor(
    private experiencesService: ExperiencesService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.experiencesService.getAll().pipe(
      timeout(15000),
      finalize(() => { this.loading = false; }),
    ).subscribe({
      next: e => { this.experiences = e; },
      error: () => {},
    });
  }

  openCreate(): void {
    this.editingId = null;
    this.technologies = [];
    this.form.reset({ current: false, order: 0 });
    this.showForm = true;
  }

  openEdit(exp: Experience): void {
    this.editingId = exp._id;
    this.technologies = [...exp.technologies];
    this.form.patchValue({ ...exp });
    this.showForm = true;
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving = true;
    const payload = { ...this.form.value, technologies: this.technologies } as any;
    const req$ = this.editingId
      ? this.experiencesService.update(this.editingId, payload)
      : this.experiencesService.create(payload);

    req$.subscribe({
      next: () => {
        this.saving = false; this.showForm = false;
        this.snackBar.open('Experience saved!', 'Close', { duration: 3000 });
        this.load();
      },
      error: () => { this.saving = false; this.snackBar.open('Failed to save.', 'Close', { duration: 3000 }); },
    });
  }

  delete(id: string): void {
    if (!confirm('Delete this experience?')) return;
    this.experiencesService.remove(id).subscribe({
      next: () => {
        this.experiences = this.experiences.filter(e => e._id !== id);
        this.snackBar.open('Deleted.', 'Close', { duration: 3000 });
      },
    });
  }

  addTech(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value) this.technologies.push(value);
    event.chipInput!.clear();
  }

  removeTech(tech: string): void {
    const idx = this.technologies.indexOf(tech);
    if (idx >= 0) this.technologies.splice(idx, 1);
  }
}
