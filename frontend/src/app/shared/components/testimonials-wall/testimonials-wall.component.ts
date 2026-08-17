import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { TestimonialsService } from '../../../core/services/testimonials.service';
import { Testimonial } from '../../../core/models/testimonial.model';
import { LangUrlPipe } from '../../pipes/lang-url.pipe';
import { RatingStarsComponent } from '../rating-stars/rating-stars.component';

@Component({
  selector: 'app-testimonials-wall',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, LangUrlPipe, RatingStarsComponent],
  templateUrl: './testimonials-wall.component.html',
  styleUrls: ['./testimonials-wall.component.scss'],
})
export class TestimonialsWallComponent implements OnInit {
  @Input() featuredOnly = true;
  @Input() limit = 6;

  testimonials = signal<Testimonial[]>([]);

  constructor(private testimonialsService: TestimonialsService) {}

  ngOnInit(): void {
    if (this.featuredOnly) {
      this.testimonialsService.getFeatured(this.limit).subscribe({
        next: (data) => this.testimonials.set(data),
        error: () => this.testimonials.set([]),
      });
    } else {
      this.testimonialsService.list(this.limit, 0).subscribe({
        next: (res) => this.testimonials.set(res.data),
        error: () => this.testimonials.set([]),
      });
    }
  }

  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }
}
