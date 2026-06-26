import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="tool-page">
      <div class="tool-hero">
        <div class="tool-icon">👁</div>
        <h1>PDF Viewer</h1>
        <p>View, navigate, and inspect PDF documents with a high-fidelity in-browser renderer.</p>
        <div class="coming-badge">Coming Soon</div>
      </div>
      <div class="features-grid">
        @for (f of features; track f.title) {
          <div class="feature-card">
            <span class="feature-icon">{{ f.icon }}</span>
            <h3>{{ f.title }}</h3>
            <p>{{ f.desc }}</p>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: var(--bg-primary, #0d1117); }
    .tool-page { padding: 4rem 2rem; max-width: 900px; margin: 0 auto; }
    .tool-hero { text-align: center; margin-bottom: 3rem; }
    .tool-icon { font-size: 4rem; margin-bottom: 1rem; }
    h1 { font-size: 2.5rem; font-weight: 800; margin: 0 0 1rem; color: var(--text-primary, #e6edf3); }
    p { font-size: 1.05rem; color: var(--text-secondary, #8b949e); line-height: 1.7; max-width: 500px; margin: 0 auto 1.5rem; }
    .coming-badge {
      display: inline-block; padding: 0.4rem 1.2rem; border-radius: 100px;
      background: rgba(108,99,255,0.12); border: 1px solid rgba(108,99,255,0.3);
      color: #a78bfa; font-size: 0.82rem; font-weight: 600; letter-spacing: 0.05em;
    }
    .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .feature-card {
      background: var(--bg-secondary, #161b22); border: 1px solid var(--border-color, #30363d);
      border-radius: 14px; padding: 1.5rem; transition: border-color 0.2s;
      &:hover { border-color: rgba(108,99,255,0.4); }
    }
    .feature-icon { font-size: 1.75rem; display: block; margin-bottom: 0.75rem; }
    h3 { font-size: 0.9rem; font-weight: 700; margin: 0 0 0.4rem; color: var(--text-primary, #e6edf3); }
    .feature-card p { font-size: 0.8rem; color: var(--text-secondary, #8b949e); margin: 0; }
  `],
})
export class ViewerComponent {
  readonly features = [
    { icon: '🔍', title: 'Zoom & Pan',       desc: 'Smooth zoom from 25% to 500% with mouse wheel support.' },
    { icon: '📑', title: 'Page Navigation',   desc: 'Jump to any page instantly with thumbnail strip.' },
    { icon: '🔎', title: 'Text Search',       desc: 'Full-text search with highlight across all pages.' },
    { icon: '🖨️', title: 'Print Ready',      desc: 'Optimised print layout with custom page ranges.' },
    { icon: '📐', title: 'Two-Page View',     desc: 'Side-by-side spread view for book-style documents.' },
    { icon: '📌', title: 'Bookmarks',         desc: 'Navigate via document outline and table of contents.' },
  ];
}
