import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { forkJoin, catchError, of } from 'rxjs';
import { ProjectsService } from '../../../core/services/projects.service';
import { ExperiencesService } from '../../../core/services/experiences.service';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

interface StatCard {
  labelKey: string;
  value: number;
  icon: string;
  route: string;
  color: string;
  miniBars: number[];
}

interface RecentContact {
  name: string;
  email: string;
  subject: string;
  createdAt: string;
}

interface ChartBar {
  date: string;
  value: number;
}

interface AdminStatsResponse {
  users: number;
  contacts: number;
  recentContacts: RecentContact[];
  contactsByDay: Array<{ date: string; count: number }>;
  content: {
    total: number;
    published: number;
    drafts: number;
  };
  visits: {
    totalViews: number;
    uniqueVisitors: number;
    viewsByDay: Array<{ date: string; count: number }>;
  };
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MatCardModule, MatIconModule, MatButtonModule, TranslateModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  stats: StatCard[] = [];
  recentContacts: RecentContact[] = [];
  contactBars: ChartBar[] = [];
  visitBars: ChartBar[] = [];
  publishedPosts = 0;
  draftPosts = 0;
  totalViews = 0;
  uniqueVisitors = 0;
  loading = true;

  readonly quickLinks = [
    { labelKey: 'admin.manage_projects',    icon: 'work',       route: '/admin/projects' },
    { labelKey: 'admin.manage_experiences', icon: 'history_edu',route: '/admin/experiences' },
    { labelKey: 'admin.manage_blog',        icon: 'article',    route: '/admin/blog' },
    { labelKey: 'admin.edit_about',         icon: 'person',     route: '/admin/about' },
  ];

  constructor(
    public auth: AuthService,
    private projectsService: ProjectsService,
    private experiencesService: ExperiencesService,
    private http: HttpClient,
  ) {}

  ngOnInit(): void {
    forkJoin({
      projects:    this.projectsService.getAll(),
      experiences: this.experiencesService.getAll(),
      adminStats:  this.http.get<AdminStatsResponse>(
        `${environment.apiUrl}/stats`,
      ).pipe(catchError(() => of({
        users: 0,
        contacts: 0,
        recentContacts: [],
        contactsByDay: [],
        content: { total: 0, published: 0, drafts: 0 },
        visits: { totalViews: 0, uniqueVisitors: 0, viewsByDay: [] },
      }))),
    }).subscribe({
      next: ({ projects, experiences, adminStats }) => {
        const totalPosts = adminStats.content.total;
        const publishedPosts = adminStats.content.published;
        const totalValues = [
          projects.length,
          experiences.length,
          totalPosts,
          publishedPosts,
          adminStats.contacts,
          adminStats.users,
          adminStats.visits.totalViews,
          adminStats.visits.uniqueVisitors,
        ];
        const maxValue = Math.max(...totalValues, 1);

        this.stats = [
          { labelKey: 'admin.projects',    value: projects.length,                       icon: 'work',                   route: '/admin/projects',    color: '#6366f1', miniBars: this.buildMiniBars(projects.length, maxValue, 0) },
          { labelKey: 'admin.experiences', value: experiences.length,                    icon: 'history_edu',            route: '/admin/experiences', color: '#06b6d4', miniBars: this.buildMiniBars(experiences.length, maxValue, 1) },
          { labelKey: 'admin.blog_posts',  value: totalPosts,                            icon: 'article',                route: '/admin/blog',        color: '#10b981', miniBars: this.buildMiniBars(totalPosts, maxValue, 2) },
          { labelKey: 'admin.published',   value: publishedPosts,                        icon: 'published_with_changes', route: '/admin/blog',        color: '#f59e0b', miniBars: this.buildMiniBars(publishedPosts, maxValue, 3) },
          { labelKey: 'admin.contacts',    value: adminStats.contacts,                   icon: 'mail',                   route: '/admin',             color: '#ec4899', miniBars: this.buildMiniBars(adminStats.contacts, maxValue, 4) },
          { labelKey: 'admin.users',       value: adminStats.users,                      icon: 'group',                  route: '/admin',             color: '#8b5cf6', miniBars: this.buildMiniBars(adminStats.users, maxValue, 5) },
          { labelKey: 'admin.visits',      value: adminStats.visits.totalViews,          icon: 'visibility',             route: '/admin',             color: '#14b8a6', miniBars: this.buildMiniBars(adminStats.visits.totalViews, maxValue, 6) },
          { labelKey: 'admin.visitors',    value: adminStats.visits.uniqueVisitors,      icon: 'monitoring',             route: '/admin',             color: '#ef4444', miniBars: this.buildMiniBars(adminStats.visits.uniqueVisitors, maxValue, 7) },
        ];
        this.recentContacts = adminStats.recentContacts;
        this.contactBars = adminStats.contactsByDay.map(item => ({ date: item.date, value: item.count }));
        this.visitBars = adminStats.visits.viewsByDay.map(item => ({ date: item.date, value: item.count }));
        this.publishedPosts = publishedPosts;
        this.draftPosts = adminStats.content.drafts;
        this.totalViews = adminStats.visits.totalViews;
        this.uniqueVisitors = adminStats.visits.uniqueVisitors;
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  get maxContactBarValue(): number {
    return Math.max(...this.contactBars.map(bar => bar.value), 1);
  }

  get maxVisitBarValue(): number {
    return Math.max(...this.visitBars.map(bar => bar.value), 1);
  }

  get totalContent(): number {
    return this.publishedPosts + this.draftPosts;
  }

  get publishedPercent(): number {
    return this.totalContent ? (this.publishedPosts / this.totalContent) * 100 : 0;
  }

  get draftPercent(): number {
    return this.totalContent ? (this.draftPosts / this.totalContent) * 100 : 0;
  }

  contactBarHeight(value: number): string {
    const percent = (value / this.maxContactBarValue) * 100;
    return `${Math.max(percent, value > 0 ? 18 : 8)}%`;
  }

  visitBarHeight(value: number): string {
    const percent = (value / this.maxVisitBarValue) * 100;
    return `${Math.max(percent, value > 0 ? 18 : 8)}%`;
  }

  private buildMiniBars(value: number, maxValue: number, seed: number): number[] {
    const normalized = maxValue ? value / maxValue : 0;
    const pattern = [0.42, 0.68, 0.54, 0.82, 0.61, 0.9];

    return pattern.map((point, index) => {
      const offset = ((seed + index) % 3) * 4;
      const height = 16 + normalized * 42 + point * 30 + offset;
      return Math.max(18, Math.min(Math.round(height), 92));
    });
  }

}
