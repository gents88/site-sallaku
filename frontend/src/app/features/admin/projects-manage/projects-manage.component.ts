import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ProjectsService } from '../../../core/services/projects.service';
import { Project, ProjectTranslations } from '../../../core/models/project.model';
import { TranslatableField, TranslationsEditorComponent, TranslationsValue, compactTranslations } from '../../../shared/components/translations-editor/translations-editor.component';
import { NavIconComponent } from '../../../shared/components/nav-icon/nav-icon.component';
import { HasUnsavedChanges, warnOnUnload } from '../../../core/guards/unsaved-changes.guard';
import { DirtyTracker } from '../../../shared/utils/dirty-tracker';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-projects-manage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule,
    MatCheckboxModule, MatDialogModule, MatSnackBarModule, MatChipsModule,
    LoadingSpinnerComponent, TranslateModule, DragDropModule, TranslationsEditorComponent, NavIconComponent,
  ],
  templateUrl: './projects-manage.component.html',
  styleUrls: ['./projects-manage.component.scss'],
})
export class ProjectsManageComponent implements OnInit, HasUnsavedChanges {
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
    // Case study: se almeno uno è compilato il progetto ottiene /projects/:slug.
    problem:      [''],
    solution:     [''],
    results:      [''],
  });

  translations: TranslationsValue = {};
  reordering = false;
  private readonly dirty = new DirtyTracker();
  private readonly route = inject(ActivatedRoute);

  private formState() {
    return {
      form: this.form.getRawValue(),
      technologies: this.technologies,
      images: this.images,
      translations: compactTranslations(this.translations),
    };
  }

  hasUnsavedChanges(): boolean {
    return this.showForm && this.dirty.isDirty(this.formState());
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    warnOnUnload(event, this.hasUnsavedChanges());
  }

  /** "Annulla" chiede conferma se si perderebbero modifiche, come l'uscita dalla pagina. */
  cancelForm(): void {
    if (this.hasUnsavedChanges() && !confirm(this.t.instant('common.unsaved_confirm'))) return;
    this.showForm = false;
    this.dirty.reset();
  }

  readonly translatableFields: TranslatableField[] = [
    { key: 'title', labelKey: 'projects_manage.title_label' },
    { key: 'description', labelKey: 'projects_manage.description_label', multiline: true },
    { key: 'problem', labelKey: 'projects_manage.problem_label', multiline: true },
    { key: 'solution', labelKey: 'projects_manage.solution_label', multiline: true },
    { key: 'results', labelKey: 'projects_manage.results_label', multiline: true },
  ];

  /** Testi italiani correnti del form, per la traduzione automatica. */
  get translationSource(): Record<string, string> {
    const v = this.form.getRawValue();
    return { title: v.title ?? '', description: v.description ?? '', problem: v.problem ?? '', solution: v.solution ?? '', results: v.results ?? '' };
  }

  technologies: string[] = [];
  images: string[] = [];

  constructor(
    private projectsService: ProjectsService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private t: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadProjects();
    // ?new=1 dalla palette Ctrl+K ("Nuovo progetto"): apre direttamente il form.
    if (this.route.snapshot.queryParamMap.get('new') === '1') this.openCreate();
  }

  loadProjects(): void {
    this.loading = true;
    this.projectsService.getAll().pipe(
      timeout(15000),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: p => { this.projects = p; this.loading = false; },
      error: () => {},
    });
  }

  openCreate(): void {
    this.editingId = null;
    this.technologies = [];
    this.images = [];
    this.translations = {};
    this.form.reset({ featured: false, order: 0, problem: '', solution: '', results: '' });
    this.showForm = true;
    this.dirty.mark(this.formState());
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
      problem: project.problem ?? '',
      solution: project.solution ?? '',
      results: project.results ?? '',
    });
    this.translations = structuredClone(project.translations ?? {}) as TranslationsValue;
    this.showForm = true;
    this.dirty.mark(this.formState());
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving = true;
    const payload = {
      ...this.form.value,
      technologies: this.technologies,
      images: this.images,
      translations: compactTranslations<ProjectTranslations>(this.translations),
    } as any;

    const req$ = this.editingId
      ? this.projectsService.update(this.editingId, payload)
      : this.projectsService.create(payload);

    req$.subscribe({
      next: () => {
        this.saving = false;
        this.showForm = false;
        this.dirty.reset();
        this.cdr.markForCheck();
        this.snackBar.open(this.t.instant('projects_manage.saved'), this.t.instant('common.close'), { duration: 3000 });
        this.loadProjects();
      },
      error: () => {
        this.saving = false;
        this.cdr.markForCheck();
        this.snackBar.open(this.t.instant('projects_manage.save_error'), this.t.instant('common.close'), { duration: 3000 });
      },
    });
  }

  delete(id: string): void {
    if (!confirm(this.t.instant('projects_manage.confirm_delete'))) return;
    this.projectsService.remove(id).subscribe({
      next: () => {
        this.projects = this.projects.filter(p => p._id !== id);
        this.cdr.markForCheck();
        this.snackBar.open(this.t.instant('projects_manage.deleted'), this.t.instant('common.close'), { duration: 3000 });
      },
    });
  }

  /** Drag & drop (CDK) e pulsanti su/giù per la tastiera: stesso salvataggio. */
  drop(event: CdkDragDrop<Project[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.applyOrder(event.previousIndex, event.currentIndex);
  }

  move(index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (target < 0 || target >= this.projects.length) return;
    this.applyOrder(index, target);
  }

  private applyOrder(from: number, to: number): void {
    const previous = [...this.projects];
    moveItemInArray(this.projects, from, to);
    this.projects = [...this.projects];
    this.reordering = true;
    this.projectsService.reorder(this.projects.map(p => p._id)).subscribe({
      next: () => {
        this.reordering = false;
        this.projects.forEach((p, i) => (p.order = i));
        this.cdr.markForCheck();
      },
      error: () => {
        // Ordine non salvato: si torna a quello del server invece di mostrarne uno falso.
        this.projects = previous;
        this.reordering = false;
        this.cdr.markForCheck();
        this.snackBar.open(this.t.instant('projects_manage.reorder_error'), this.t.instant('common.close'), { duration: 3000 });
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
