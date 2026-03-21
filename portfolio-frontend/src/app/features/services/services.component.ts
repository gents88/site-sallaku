import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';
import { SeoService } from '../../core/services/seo.service';

interface ServiceItem {
  key: string;
  icon: string;
  colorClass: string;
}

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, MatIconModule],
  templateUrl: './services.component.html',
  styleUrls: ['./services.component.scss'],
})
export class ServicesComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly services: ServiceItem[] = [
    { key: 'frontend', icon: 'web',            colorClass: 'color-blue'   },
    { key: 'web3d',    icon: 'public',          colorClass: 'color-cyan'   },
    { key: 'dataviz',  icon: 'bar_chart',       colorClass: 'color-violet' },
    { key: 'uiux',     icon: 'design_services', colorClass: 'color-pink'   },
    { key: 'perf',     icon: 'speed',           colorClass: 'color-orange' },
    { key: 'api',      icon: 'api',             colorClass: 'color-green'  },
  ];

  private revealObserver: IntersectionObserver | null = null;

  constructor(private seo: SeoService) {}

  ngOnInit(): void {
    this.seo.update({
      title: 'Services',
      description:
        'Professional services by Gent Sallaku: Angular front-end development, 3D web applications with Cesium.js, data visualization, UI/UX design, performance optimization and API integration.',
    });
  }

  ngAfterViewInit(): void {
    this.revealObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            this.revealObserver?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 },
    );
    document.querySelectorAll('.reveal').forEach(el => this.revealObserver?.observe(el));
  }

  ngOnDestroy(): void {
    this.revealObserver?.disconnect();
  }
}
