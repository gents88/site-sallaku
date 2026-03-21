import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ProjectsService } from '../../../core/services/projects.service';
import { SeoService } from '../../../core/services/seo.service';
import { Project } from '../../../core/models/project.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-projects-list',
  standalone: true,
  imports: [CommonModule, MatIconModule, LoadingSpinnerComponent],
  templateUrl: './projects-list.component.html',
  styleUrls: ['./projects-list.component.scss'],
})
export class ProjectsListComponent implements OnInit {
  projects: Project[] = [];
  filtered: Project[] = [];
  allTags: string[] = [];
  activeTag: string | null = null;
  loading = true;

  constructor(
    private projectsService: ProjectsService,
    private seo: SeoService,
  ) {}

  ngOnInit(): void {
    this.seo.update({ title: 'Projects', description: 'Browse all portfolio projects.' });
    this.projectsService.getAll().subscribe({
      next: projects => {
        this.projects = projects;
        this.filtered = projects;
        const tagsSet = new Set(projects.flatMap(p => p.technologies));
        this.allTags = Array.from(tagsSet).sort();
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  filterByTag(tag: string | null): void {
    this.activeTag = tag;
    this.filtered = tag ? this.projects.filter(p => p.technologies.includes(tag)) : this.projects;
  }
}
