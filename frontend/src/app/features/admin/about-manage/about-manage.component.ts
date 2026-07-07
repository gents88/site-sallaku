import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatChipInputEvent } from '@angular/material/chips';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { finalize, timeout } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AboutService } from '../../../core/services/about.service';
import { About } from '../../../core/models/about.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-about-manage',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule,
    MatSnackBarModule, MatChipsModule, LoadingSpinnerComponent, TranslateModule,
  ],
  templateUrl: './about-manage.component.html',
  styleUrls: ['./about-manage.component.scss'],
})
export class AboutManageComponent implements OnInit {
  loading = true;
  saving = false;
  separatorKeys = [ENTER, COMMA];
  skills: string[] = [];

  form = this.fb.group({
    headline:   ['', Validators.required],
    bio:        ['', Validators.required],
    location:   [''],
    avatarUrl:  [''],
    resumeUrl:  [''],
    // socials
    github:     [''],
    linkedin:   [''],
    twitter:    [''],
    email:      [''],
  });

  constructor(
    private aboutService: AboutService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private t: TranslateService,
  ) {}

  ngOnInit(): void {
    this.aboutService.get().pipe(
      timeout(15000),
      finalize(() => { this.loading = false; }),
    ).subscribe({
      next: about => {
        this.skills = [...(about.skills ?? [])];
        this.form.patchValue({
          headline: about.headline, bio: about.bio,
          location: about.location, avatarUrl: about.avatarUrl, resumeUrl: about.resumeUrl,
          github: about.socials?.github ?? '',
          linkedin: about.socials?.linkedin ?? '',
          twitter: about.socials?.twitter ?? '',
          email: about.socials?.email ?? '',
        });
        this.loading = false;
      },
      error: () => {},
    });
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving = true;

    const { github, linkedin, twitter, email, ...rest } = this.form.value as any;
    const payload: Partial<About> = {
      ...rest,
      skills: this.skills,
      socials: { github, linkedin, twitter, email },
    };

    this.aboutService.update(payload).subscribe({
      next: () => {
        this.saving = false;
        this.snackBar.open(this.t.instant('about_manage.update_success'), this.t.instant('common.close'), { duration: 3000 });
      },
      error: () => {
        this.saving = false;
        this.snackBar.open(this.t.instant('about_manage.update_error'), this.t.instant('common.close'), { duration: 3000 });
      },
    });
  }

  addSkill(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value) this.skills.push(value);
    event.chipInput!.clear();
  }

  removeSkill(skill: string): void {
    const idx = this.skills.indexOf(skill);
    if (idx >= 0) this.skills.splice(idx, 1);
  }
}
