import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="tool-page">
      <div class="tool-hero">
        <div class="tool-icon">✏️</div>
        <h1>Document Editor</h1>
        <p>Rich-text document editor with real-time collaboration and export to PDF.</p>
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
export class EditorComponent {
  readonly features = [
    { icon: '📝', title: 'Rich Text',       desc: 'Full formatting: headings, lists, tables, inline styles.' },
    { icon: '🤝', title: 'Collaboration',   desc: 'Real-time multi-user editing with presence indicators.' },
    { icon: '📤', title: 'Export to PDF',   desc: 'One-click high-fidelity PDF export from your document.' },
    { icon: '📥', title: 'Import Word',     desc: 'Import .docx files and continue editing in the browser.' },
    { icon: '🕓', title: 'Version History', desc: 'Browse and restore any previous revision at any time.' },
    { icon: '🔒', title: 'Access Control',  desc: 'Set view/comment/edit permissions per collaborator.' },
  ];
}
