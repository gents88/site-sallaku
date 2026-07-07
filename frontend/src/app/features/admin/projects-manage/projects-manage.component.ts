import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { MatChipInputEvent } from '@angular/material/chips';
import { finalize, timeout } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ProjectsService } from '../../../core/services/projects.service';
import { Project } from '../../../core/models/project.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-projects-manage',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule,
    MatCheckboxModule, MatDialogModule, MatSnackBarModule, MatChipsModule,
    LoadingSpinnerComponent, TranslateModule,
  ],
  templateUrl: './projects-manage.component.html',
  styleUrls: ['./projects-manage.component.scss'],
})
export class ProjectsManageComponent implements OnInit {
  projects: Project[] = [];
  loading = true;
  showForm = false;
  editingId: string | null = null;
  saving = false;
  separatorKeys = [ENTER, COMMA];

  form = this.fb.group({
    title:        ['', [Validators.required]],
    description:  ['', [Validators.required]],
    liveUrl:      [''],
    repoUrl:      [''],
    featured:     [false],
    order:        [0],
  });

  technologies: string[] = [];
  images: string[] = [];

  constructor(
    private projectsService: ProjectsService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private t: TranslateService,
  ) {}

  ngOnInit(): void {
    this.loadProjects();
  }

  loadProjects(): void {
    this.loading = true;
    this.projectsService.getAll().pipe(
      timeout(15000),
      finalize(() => { this.loading = false; }),
    ).subscribe({
      next: p => { this.projects = p; this.loading = false; },
      error: () => {},
    });
  }

  openCreate(): void {
    this.editingId = null;
    this.technologies = [];
    this.images = [];
    this.form.reset({ featured: false, order: 0 });
    this.showForm = true;
  }

  openEdit(project: Project): void {
    this.editingId = project._id;
    this.technologies = [...project.technologies];
    this.images = [...project.images];
    this.form.patchValue({
      title: project.title,
      description: project.description,
      liveUrl: project.liveUrl ?? '',
      repoUrl: project.repoUrl ?? '',
      featured: project.featured,
      order: project.order,
    });
    this.showForm = true;
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving = true;
    const payload = { ...this.form.value, technologies: this.technologies, images: this.images } as any;

    const req$ = this.editingId
      ? this.projectsService.update(this.editingId, payload)
      : this.projectsService.create(payload);

    req$.subscribe({
      next: () => {
        this.saving = false;
        this.showForm = false;
        this.snackBar.open(this.t.instant('projects_manage.saved'), this.t.instant('common.close'), { duration: 3000 });
        this.loadProjects();
      },
      error: () => {
        this.saving = false;
        this.snackBar.open(this.t.instant('projects_manage.save_error'), this.t.instant('common.close'), { duration: 3000 });
      },
    });
  }

  delete(id: string): void {
    if (!confirm(this.t.instant('projects_manage.confirm_delete'))) return;
    this.projectsService.remove(id).subscribe({
      next: () => {
        this.projects = this.projects.filter(p => p._id !== id);
        this.snackBar.open(this.t.instant('projects_manage.deleted'), this.t.instant('common.close'), { duration: 3000 });
      },
    });
  }

  addChip(field: 'technologies' | 'images', event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value) this[field].push(value);
    event.chipInput!.clear();
  }

  removeChip(field: 'technologies' | 'images', item: string): void {
    const idx = this[field].indexOf(item);
    if (idx >= 0) this[field].splice(idx, 1);
  }
}
