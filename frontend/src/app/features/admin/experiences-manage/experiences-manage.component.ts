import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnInit } from '@angular/core';
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
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ExperiencesService } from '../../../core/services/experiences.service';
import { Experience, ExperienceTranslations } from '../../../core/models/experience.model';
import { TranslatableField, TranslationsEditorComponent, TranslationsValue, compactTranslations } from '../../../shared/components/translations-editor/translations-editor.component';
import { NavIconComponent } from '../../../shared/components/nav-icon/nav-icon.component';
import { HasUnsavedChanges, warnOnUnload } from '../../../core/guards/unsaved-changes.guard';
import { DirtyTracker } from '../../../shared/utils/dirty-tracker';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-experiences-manage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule,
    MatCheckboxModule, MatSnackBarModule, MatChipsModule, LoadingSpinnerComponent, TranslateModule,
    DragDropModule, TranslationsEditorComponent, NavIconComponent,
  ],
  templateUrl: './experiences-manage.component.html',
  styleUrls: ['./experiences-manage.component.scss'],
})
export class ExperiencesManageComponent implements OnInit, HasUnsavedChanges {
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

  translations: TranslationsValue = {};
  reordering = false;
  private readonly dirty = new DirtyTracker();

  private formState() {
    return { form: this.form.getRawValue(), technologies: this.technologies, translations: compactTranslations(this.translations) };
  }

  hasUnsavedChanges(): boolean {
    return this.showForm && this.dirty.isDirty(this.formState());
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    warnOnUnload(event, this.hasUnsavedChanges());
  }

  cancelForm(): void {
    if (this.hasUnsavedChanges() && !confirm(this.t.instant('common.unsaved_confirm'))) return;
    this.showForm = false;
    this.dirty.reset();
  }

  readonly translatableFields: TranslatableField[] = [
    { key: 'role', labelKey: 'experiences_manage.role_label' },
    { key: 'description', labelKey: 'experiences_manage.description_label', multiline: true },
    { key: 'location', labelKey: 'experiences_manage.location_label' },
  ];

  get translationSource(): Record<string, string> {
    const v = this.form.getRawValue();
    return { role: v.role ?? '', description: v.description ?? '', location: v.location ?? '' };
  }

  constructor(
    private experiencesService: ExperiencesService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private t: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.experiencesService.getAll().pipe(
      timeout(15000),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: e => { this.experiences = e; this.loading = false; },
      error: () => {},
    });
  }

  openCreate(): void {
    this.editingId = null;
    this.technologies = [];
    this.translations = {};
    this.form.reset({ current: false, order: 0 });
    this.showForm = true;
    this.dirty.mark(this.formState());
  }

  openEdit(exp: Experience): void {
    this.editingId = exp._id;
    this.technologies = [...exp.technologies];
    this.form.patchValue({ ...exp });
    this.translations = structuredClone(exp.translations ?? {}) as TranslationsValue;
    this.showForm = true;
    this.dirty.mark(this.formState());
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving = true;
    const payload = {
      ...this.form.value,
      technologies: this.technologies,
      translations: compactTranslations<ExperienceTranslations>(this.translations),
    } as any;
    const req$ = this.editingId
      ? this.experiencesService.update(this.editingId, payload)
      : this.experiencesService.create(payload);

    req$.subscribe({
      next: () => {
        this.saving = false; this.showForm = false; this.dirty.reset(); this.cdr.markForCheck();
        this.snackBar.open(this.t.instant('experiences_manage.saved'), this.t.instant('common.close'), { duration: 3000 });
        this.load();
      },
      error: () => { this.saving = false; this.cdr.markForCheck(); this.snackBar.open(this.t.instant('experiences_manage.save_error'), this.t.instant('common.close'), { duration: 3000 }); },
    });
  }

  delete(id: string): void {
    if (!confirm(this.t.instant('experiences_manage.confirm_delete'))) return;
    this.experiencesService.remove(id).subscribe({
      next: () => {
        this.experiences = this.experiences.filter(e => e._id !== id);
        this.cdr.markForCheck();
        this.snackBar.open(this.t.instant('experiences_manage.deleted'), this.t.instant('common.close'), { duration: 3000 });
      },
    });
  }

  /** Drag & drop (CDK) e pulsanti su/giù per la tastiera: stesso salvataggio. */
  drop(event: CdkDragDrop<Experience[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.applyOrder(event.previousIndex, event.currentIndex);
  }

  move(index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (target < 0 || target >= this.experiences.length) return;
    this.applyOrder(index, target);
  }

  private applyOrder(from: number, to: number): void {
    const previous = [...this.experiences];
    moveItemInArray(this.experiences, from, to);
    this.experiences = [...this.experiences];
    this.reordering = true;
    this.experiencesService.reorder(this.experiences.map(e => e._id)).subscribe({
      next: () => {
        this.reordering = false;
        this.experiences.forEach((e, i) => (e.order = i));
        this.cdr.markForCheck();
      },
      error: () => {
        this.experiences = previous;
        this.reordering = false;
        this.cdr.markForCheck();
        this.snackBar.open(this.t.instant('projects_manage.reorder_error'), this.t.instant('common.close'), { duration: 3000 });
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
