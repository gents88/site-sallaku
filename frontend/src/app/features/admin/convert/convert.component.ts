import { Component, ChangeDetectionStrategy, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpEventType, HttpResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  ConversionService, ConversionTypeId, CONVERSION_TYPES, ConversionDef,
} from '../../../core/services/conversion.service';

type Step = 'preview' | 'convert';
type Kind = 'pdf' | 'image' | 'text' | 'base64' | 'unknown';

const GROUP_META: Record<string, { icon: string; nameKey: string; descKey: string }> = {
  'Documenti':   { icon: '📄', nameKey: 'convert.group_docs',       descKey: 'convert.group_docs_desc'       },
  'Spreadsheet': { icon: '📊', nameKey: 'convert.group_sheets',     descKey: 'convert.group_sheets_desc'     },
  'Immagini':    { icon: '🖼️', nameKey: 'convert.group_images',     descKey: 'convert.group_images_desc'     },
  'Strutturati': { icon: '🗃️', nameKey: 'convert.group_structured', descKey: 'convert.group_structured_desc' },
  'Base64':      { icon: '🔐', nameKey: 'convert.group_base64',     descKey: 'convert.group_base64_desc'     },
  'Utilità':     { icon: '🔧', nameKey: 'convert.group_utils',      descKey: 'convert.group_utils_desc'      },
};

@Component({
  selector: 'app-convert',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
  template: `
    <!-- ════════════════ LANDING PAGE ════════════════ -->
    <div class="cp-page">

      <header class="cp-header">
        <h1 class="cp-title">{{ 'convert.title' | translate }}</h1>
        <p class="cp-subtitle">{{ totalCount }} {{ 'convert.subtitle' | translate }}</p>
        <div class="cp-search-wrap">
          <span class="cp-search-icon">🔍</span>
          <input class="cp-search" type="search" [placeholder]="'convert.search_placeholder' | translate"
                 [value]="searchQuery()"
                 (input)="searchQuery.set($any($event.target).value)">
          <button *ngIf="searchQuery()" class="cp-search-clear" (click)="searchQuery.set('')" aria-label="×">✕</button>
        </div>
      </header>

      <!-- Preferiti -->
      <section *ngIf="favoriteItems().length > 0 && !searchQuery()" class="cp-section">
        <div class="cp-section-header">
          <span class="cp-group-icon">⭐</span>
          <div>
            <h2 class="cp-group-name">{{ 'convert.favorites' | translate }}</h2>
            <p class="cp-group-desc">{{ 'convert.favorites_desc' | translate }}</p>
          </div>
        </div>
        <div class="cp-grid">
          <button *ngFor="let item of favoriteItems()" class="cp-card cp-card--fav" (click)="open(item)">
            <div class="cp-card-badges">
              <span class="cp-badge" [attr.data-fmt]="item.from">{{ item.from }}</span>
              <span class="cp-arrow">→</span>
              <span class="cp-badge" [attr.data-fmt]="item.to">{{ item.to }}</span>
            </div>
            <span class="cp-card-label">{{ item.label | translate }}</span>
            <button class="cp-fav cp-fav--active" [attr.aria-label]="'convert.remove_fav' | translate"
                    (click)="toggleFav($event, item.id)">★</button>
          </button>
        </div>
      </section>

      <!-- Nessun risultato -->
      <div *ngIf="visibleGroups().length === 0" class="cp-empty">
        <span class="cp-empty-icon">🔍</span>
        <p>{{ 'convert.no_results' | translate: { query: searchQuery() } }}</p>
        <button class="cp-btn-ghost" (click)="searchQuery.set('')">{{ 'convert.show_all' | translate }}</button>
      </div>

      <!-- Categorie -->
      <section *ngFor="let g of visibleGroups()" class="cp-section">
        <div class="cp-section-header">
          <span class="cp-group-icon">{{ g.icon }}</span>
          <div>
            <h2 class="cp-group-name">{{ g.nameKey | translate }}</h2>
            <p class="cp-group-desc">{{ g.descKey | translate }}</p>
          </div>
          <span class="cp-count-badge">{{ g.items.length }}</span>
        </div>
        <div class="cp-grid">
          <button *ngFor="let item of g.items"
                  class="cp-card"
                  [class.cp-card--fav]="favorites().has(item.id)"
                  (click)="open(item)">
            <div class="cp-card-badges">
              <span class="cp-badge" [attr.data-fmt]="item.from">{{ item.from }}</span>
              <span class="cp-arrow">→</span>
              <span class="cp-badge" [attr.data-fmt]="item.to">{{ item.to }}</span>
            </div>
            <span class="cp-card-label">{{ item.label | translate }}</span>
            <button class="cp-fav"
                    [class.cp-fav--active]="favorites().has(item.id)"
                    [attr.aria-label]="(favorites().has(item.id) ? 'convert.remove_fav' : 'convert.add_fav') | translate"
                    (click)="toggleFav($event, item.id)">
              {{ favorites().has(item.id) ? '★' : '☆' }}
            </button>
          </button>
        </div>
      </section>

    </div>

    <!-- ════════════════ MODAL ════════════════ -->
    <div *ngIf="openModal()" class="ov" (click)="tryClose()">
      <section class="md" (click)="$event.stopPropagation()" role="dialog" aria-modal="true"
               [attr.aria-label]="'convert.title' | translate">

        <header>
          <div class="md-title-block">
            <div class="md-conv-badge" *ngIf="selectedDef()">
              <span class="cp-badge cp-badge--sm" [attr.data-fmt]="selectedDef()!.from">{{ selectedDef()!.from }}</span>
              <span class="md-arrow">→</span>
              <span class="cp-badge cp-badge--sm" [attr.data-fmt]="selectedDef()!.to">{{ selectedDef()!.to }}</span>
            </div>
            <h2>{{ selectedDef()?.label | translate }}</h2>
            <small class="md-step-label">{{ 'convert.step' | translate }} {{ step() === 'preview' ? '1' : '2' }} {{ 'convert.step_of' | translate }} 2</small>
          </div>
          <button class="x" (click)="tryClose()" [attr.aria-label]="'convert.close' | translate">✕</button>
        </header>

        <div class="st">
          <span [class.a]="step() === 'preview'" [class.done]="step() === 'convert'">
            <span class="st-num">1</span>&nbsp;{{ 'convert.step1_label' | translate }}
          </span>
          <span class="st-sep">›</span>
          <span [class.a]="step() === 'convert'">
            <span class="st-num">2</span>&nbsp;{{ 'convert.step2_label' | translate }}
          </span>
        </div>

        <main>

          <!-- Step 1 -->
          <section *ngIf="step() === 'preview'">
            <div class="dz"
                 (click)="pick.click()"
                 (dragover)="$event.preventDefault()"
                 (drop)="drop($event)"
                 [class.dz--active]="file()">
              <input #pick type="file" hidden
                     (change)="select($event)"
                     [attr.accept]="selectedDef()?.accept || null"
                     [attr.multiple]="(selectedDef()?.multi ?? false) ? true : null">
              <ng-container *ngIf="!file(); else fileLoaded">
                <span class="dz-icon">📂</span>
                <strong>{{ 'convert.drop_prompt' | translate }}</strong>
                <small *ngIf="selectedDef()?.accept">{{ 'convert.accepted_formats' | translate }}:&nbsp;<b>{{ selectedDef()!.accept }}</b></small>
              </ng-container>
              <ng-template #fileLoaded>
                <span class="dz-icon">✅</span>
                <strong>{{ file()!.name }}</strong>
                <small>{{ meta()?.size }} · {{ 'convert.change_file' | translate }}</small>
              </ng-template>
            </div>

            <div class="meta" *ngIf="meta()">
              <div><small>{{ 'convert.meta_name' | translate }}</small><b>{{ meta()!.name }}</b></div>
              <div><small>{{ 'convert.meta_size' | translate }}</small><b>{{ meta()!.size }}</b></div>
              <div><small>{{ 'convert.meta_type' | translate }}</small><b>{{ meta()!.type }}</b></div>
              <div><small>{{ 'convert.meta_pages' | translate }}</small><b>{{ meta()!.pages ?? '—' }}</b></div>
            </div>

            <article class="pv" *ngIf="file()">
              <h3>{{ 'convert.preview_title' | translate }}</h3>
              <iframe *ngIf="kind() === 'pdf' && pdf()" [src]="pdf()" class="fr" title="PDF preview"></iframe>
              <img *ngIf="kind() === 'image' && img()" [src]="img()" class="im" alt="preview">
              <pre *ngIf="(kind() === 'text' || kind() === 'base64') && txt()" class="tx">{{ txt() }}</pre>
              <p *ngIf="kind() === 'unknown'" class="pv-unknown">{{ 'convert.preview_unavailable' | translate }}</p>
              <p *ngIf="hint()" class="hint">{{ hint() }}</p>
            </article>

            <div class="ac">
              <button class="btn btn-s" (click)="tryClose()">{{ 'convert.cancel' | translate }}</button>
              <button class="btn btn-p" [disabled]="!file()" (click)="confirm()">{{ 'convert.continue_btn' | translate }}</button>
            </div>
          </section>

          <!-- Step 2 -->
          <section *ngIf="step() === 'convert'">
            <div class="conv-summary" *ngIf="selectedDef()">
              <div class="conv-summary-file">
                <span class="conv-file-icon">📄</span>
                <div>
                  <small>{{ 'convert.selected_file' | translate }}</small>
                  <b>{{ file()!.name }}</b>
                </div>
              </div>
              <div class="conv-summary-type">
                <small>{{ 'convert.conversion_label' | translate }}</small>
                <div class="conv-type-badges">
                  <span class="cp-badge" [attr.data-fmt]="selectedDef()!.from">{{ selectedDef()!.from }}</span>
                  <span class="conv-mid-arrow">→</span>
                  <span class="cp-badge" [attr.data-fmt]="selectedDef()!.to">{{ selectedDef()!.to }}</span>
                  <span class="conv-label-text">{{ selectedDef()!.label | translate }}</span>
                </div>
              </div>
              <p *ngIf="!canConvert()" class="conv-warn">
                {{ 'convert.format_warning' | translate: { accept: selectedDef()!.accept } }}
              </p>
            </div>

            <p *ngIf="msg()" class="msg" [class.msg--ok]="msgOk()">{{ msg() }}</p>

            <div *ngIf="run()" class="progress-wrap">
              <div class="progress-bar"><div class="progress-fill"></div></div>
              <small>{{ 'convert.in_progress' | translate }}</small>
            </div>

            <div class="ac">
              <button class="btn btn-s" [disabled]="run()" (click)="back()">{{ 'convert.back' | translate }}</button>
              <button class="btn btn-p" [disabled]="!canConvert() || run()" (click)="convert()">
                {{ (run() ? 'convert.converting' : 'convert.convert_now') | translate }}
              </button>
            </div>
          </section>

        </main>
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .cp-page { min-height: 100%; padding: 2rem; background: var(--bg-primary, #0d1117); }
    .cp-header { margin-bottom: 2.5rem; }
    .cp-title { font-size: 1.75rem; font-weight: 700; color: var(--text-primary, #e6edf3); margin: 0 0 0.25rem; }
    .cp-subtitle { color: var(--text-secondary, #8b949e); margin: 0 0 1.25rem; font-size: 0.9rem; }

    .cp-search-wrap { position: relative; max-width: 540px; }
    .cp-search-icon { position: absolute; left: 0.875rem; top: 50%; transform: translateY(-50%); pointer-events: none; font-size: 0.85rem; }
    .cp-search {
      width: 100%; padding: 0.65rem 2.25rem 0.65rem 2.5rem;
      border: 1px solid var(--border-color, #30363d); border-radius: 10px;
      background: var(--bg-secondary, #161b22); color: var(--text-primary, #e6edf3);
      font-size: 0.9rem; font-family: inherit; box-sizing: border-box; transition: border-color .18s, box-shadow .18s;
    }
    .cp-search::placeholder { color: var(--text-secondary, #8b949e); }
    .cp-search:focus { outline: none; border-color: var(--accent, #6c63ff); box-shadow: 0 0 0 3px rgba(108,99,255,.15); }
    .cp-search-clear {
      position: absolute; right: 0.65rem; top: 50%; transform: translateY(-50%);
      border: none; background: none; color: var(--text-secondary, #8b949e); cursor: pointer;
      padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.8rem;
    }
    .cp-search-clear:hover { color: var(--text-primary, #e6edf3); background: var(--bg-tertiary, #1c2333); }

    .cp-section { margin-bottom: 2.5rem; }
    .cp-section-header {
      display: flex; align-items: center; gap: 0.75rem;
      padding-bottom: 0.75rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color, #30363d);
    }
    .cp-group-icon { font-size: 1.4rem; flex-shrink: 0; }
    .cp-group-name { font-size: 1rem; font-weight: 600; margin: 0; color: var(--text-primary, #e6edf3); }
    .cp-group-desc { font-size: 0.78rem; color: var(--text-secondary, #8b949e); margin: 0; }
    .cp-count-badge {
      margin-left: auto; background: var(--bg-tertiary, #1c2333); border: 1px solid var(--border-color, #30363d);
      border-radius: 999px; padding: 0.1rem 0.55rem; font-size: 0.72rem; color: var(--text-secondary, #8b949e);
    }

    .cp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(175px, 1fr)); gap: 0.65rem; }

    .cp-card {
      position: relative; display: flex; flex-direction: column; gap: 0.45rem;
      padding: 0.875rem; background: var(--bg-secondary, #161b22);
      border: 1px solid var(--border-color, #30363d); border-radius: 12px;
      cursor: pointer; text-align: left; color: inherit; font-family: inherit;
      transition: border-color .18s, transform .18s, box-shadow .18s;
    }
    .cp-card:hover { border-color: var(--accent, #6c63ff); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,.35); }
    .cp-card:active { transform: translateY(0); }
    .cp-card--fav { border-color: rgba(234,179,8,.35); }

    .cp-card-badges { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }

    .cp-badge {
      padding: 0.2rem 0.45rem; border-radius: 5px; font-size: 0.68rem; font-weight: 700;
      letter-spacing: 0.02em; border: 1px solid transparent;
    }
    .cp-badge--sm { font-size: 0.62rem; padding: 0.15rem 0.38rem; }

    .cp-badge[data-fmt="PDF"]  { background: rgba(239,68,68,.15);   color: #fca5a5; border-color: rgba(239,68,68,.35); }
    .cp-badge[data-fmt="PDF+"] { background: rgba(239,68,68,.15);   color: #fca5a5; border-color: rgba(239,68,68,.35); }
    .cp-badge[data-fmt="DOCX"] { background: rgba(59,130,246,.15);  color: #93c5fd; border-color: rgba(59,130,246,.35); }
    .cp-badge[data-fmt="DOC"]  { background: rgba(59,130,246,.15);  color: #93c5fd; border-color: rgba(59,130,246,.35); }
    .cp-badge[data-fmt="TXT"]  { background: rgba(156,163,175,.12); color: #d1d5db; border-color: rgba(156,163,175,.3); }
    .cp-badge[data-fmt="HTML"] { background: rgba(249,115,22,.15);  color: #fdba74; border-color: rgba(249,115,22,.35); }
    .cp-badge[data-fmt="JSON"] { background: rgba(34,197,94,.15);   color: #86efac; border-color: rgba(34,197,94,.35); }
    .cp-badge[data-fmt="CSV"]  { background: rgba(16,185,129,.15);  color: #6ee7b7; border-color: rgba(16,185,129,.35); }
    .cp-badge[data-fmt="XLSX"] { background: rgba(16,185,129,.15);  color: #6ee7b7; border-color: rgba(16,185,129,.35); }
    .cp-badge[data-fmt="PNG"]  { background: rgba(168,85,247,.15);  color: #d8b4fe; border-color: rgba(168,85,247,.35); }
    .cp-badge[data-fmt="JPG"]  { background: rgba(168,85,247,.15);  color: #d8b4fe; border-color: rgba(168,85,247,.35); }
    .cp-badge[data-fmt="WEBP"] { background: rgba(168,85,247,.15);  color: #d8b4fe; border-color: rgba(168,85,247,.35); }
    .cp-badge[data-fmt="IMG"]  { background: rgba(168,85,247,.15);  color: #d8b4fe; border-color: rgba(168,85,247,.35); }
    .cp-badge[data-fmt="ZIP"]  { background: rgba(168,85,247,.15);  color: #d8b4fe; border-color: rgba(168,85,247,.35); }
    .cp-badge[data-fmt="B64"]  { background: rgba(251,191,36,.15);  color: #fde68a; border-color: rgba(251,191,36,.35); }
    .cp-badge[data-fmt="MD"]   { background: rgba(20,184,166,.15);  color: #99f6e4; border-color: rgba(20,184,166,.35); }
    .cp-badge[data-fmt="File"] { background: rgba(156,163,175,.12); color: #d1d5db; border-color: rgba(156,163,175,.3); }

    .cp-arrow { color: var(--text-secondary, #8b949e); font-size: 0.8rem; }
    .cp-card-label { font-size: 0.78rem; color: var(--text-secondary, #8b949e); line-height: 1.35; padding-right: 1.4rem; }

    .cp-fav {
      position: absolute; top: 0.5rem; right: 0.5rem; background: none; border: none;
      font-size: 0.875rem; cursor: pointer; color: var(--text-secondary, #8b949e);
      padding: 0.2rem; border-radius: 4px; opacity: 0; transition: opacity .15s, color .15s; line-height: 1;
    }
    .cp-card:hover .cp-fav { opacity: 1; }
    .cp-fav--active { color: #f59e0b !important; opacity: 1 !important; }

    .cp-empty { text-align: center; padding: 4rem 1rem; color: var(--text-secondary, #8b949e); }
    .cp-empty-icon { display: block; font-size: 2.5rem; margin-bottom: 0.75rem; }
    .cp-btn-ghost {
      margin-top: 0.75rem; background: none; border: 1px solid var(--border-color, #30363d);
      color: var(--text-primary, #e6edf3); padding: 0.5rem 1.25rem; border-radius: 8px;
      cursor: pointer; font-family: inherit; font-size: 0.875rem; transition: border-color .15s, color .15s;
    }
    .cp-btn-ghost:hover { border-color: var(--accent, #6c63ff); color: var(--accent, #6c63ff); }

    /* Modal */
    .ov {
      position: fixed; inset: 0; display: grid; place-items: center; padding: 1rem;
      z-index: 1000; background: rgba(0,0,0,.72); backdrop-filter: blur(8px);
    }
    .md {
      width: min(760px, 100%); max-height: calc(100dvh - 2rem);
      display: grid; grid-template-rows: auto auto 1fr; overflow: hidden;
      border-radius: 16px; border: 1px solid var(--border-color, #30363d);
      background: var(--bg-secondary, #161b22); color: var(--text-primary, #e6edf3);
      box-shadow: 0 24px 64px rgba(0,0,0,.55); animation: slide-up .22s ease;
    }
    @keyframes slide-up { from { opacity: 0; transform: translateY(16px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

    header {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding: 1.25rem 1.25rem 1rem; border-bottom: 1px solid var(--border-color, #30363d);
    }
    .md-title-block { display: flex; flex-direction: column; gap: 0.3rem; }
    .md-conv-badge { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.15rem; }
    .md-arrow { color: var(--text-secondary, #8b949e); font-size: 0.85rem; }
    header h2 { margin: 0; font-size: 1.1rem; font-weight: 600; }
    .md-step-label { color: var(--text-secondary, #8b949e); font-size: 0.78rem; }

    .x {
      width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--border-color, #30363d);
      background: var(--bg-tertiary, #1c2333); color: var(--text-secondary, #8b949e); cursor: pointer;
      font-size: 0.8rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      transition: background .15s, color .15s;
    }
    .x:hover { background: var(--bg-primary, #0d1117); color: var(--text-primary, #e6edf3); }

    .st {
      display: flex; align-items: center; gap: 0.5rem; padding: 0.7rem 1.25rem;
      border-bottom: 1px solid var(--border-color, #30363d); background: var(--bg-primary, #0d1117);
      font-size: 0.82rem; color: var(--text-secondary, #8b949e);
    }
    .st span { display: flex; align-items: center; gap: 0.35rem; }
    .st span.a  { color: var(--accent, #6c63ff); font-weight: 600; }
    .st span.done { color: var(--success, #34d399); }
    .st span.a .st-num { background: var(--accent, #6c63ff); color: #fff; border-color: transparent; }
    .st span.done .st-num { background: var(--success, #34d399); color: #fff; border-color: transparent; }
    .st-num {
      width: 20px; height: 20px; border-radius: 50%; background: var(--bg-tertiary, #1c2333);
      border: 1px solid var(--border-color, #30363d); display: flex; align-items: center;
      justify-content: center; font-size: 0.7rem; font-weight: 700; transition: background .2s;
    }
    .st-sep { color: var(--border-color, #30363d); }

    main { overflow: auto; padding: 1.25rem; }

    .dz {
      border: 2px dashed var(--border-color, #30363d); border-radius: 12px; padding: 1.5rem 1rem;
      text-align: center; cursor: pointer; display: grid; gap: 0.3rem; transition: border-color .18s, background .18s;
    }
    .dz:hover { border-color: var(--accent, #6c63ff); background: rgba(108,99,255,.04); }
    .dz--active { border-color: var(--success, #34d399); background: rgba(52,211,153,.04); }
    .dz-icon { font-size: 1.75rem; line-height: 1; }

    .meta { margin-top: 1rem; display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 0.5rem; }
    .meta div { border: 1px solid var(--border-color, #30363d); background: var(--bg-primary, #0d1117); border-radius: 8px; padding: 0.55rem 0.75rem; }
    .meta small { display: block; font-size: 0.7rem; color: var(--text-secondary, #8b949e); margin-bottom: 0.15rem; }
    .meta b { font-size: 0.82rem; word-break: break-all; }

    .pv { margin-top: 1rem; border: 1px solid var(--border-color, #30363d); border-radius: 12px; padding: 1rem; background: var(--bg-primary, #0d1117); }
    .pv h3 { margin: 0 0 0.65rem; font-size: 0.9rem; }
    .fr, .im, .tx { width: 100%; max-height: 260px; border: 1px solid var(--border-color, #30363d); border-radius: 8px; }
    .im  { object-fit: contain; background: #000; display: block; }
    .tx  { padding: .7rem; overflow: auto; white-space: pre-wrap; word-break: break-word; font-size: .78rem; background: var(--bg-tertiary,#1c2333); color: var(--text-primary,#e6edf3); }
    .pv-unknown { color: var(--text-secondary, #8b949e); font-style: italic; font-size: .85rem; }
    .hint { margin-top: .65rem; padding: .55rem .8rem; border: 1px solid rgba(108,99,255,.4); border-radius: 8px; background: rgba(108,99,255,.08); font-size: .82rem; }

    .conv-summary {
      display: flex; flex-direction: column; gap: 1rem; padding: 1.1rem;
      background: var(--bg-primary, #0d1117); border: 1px solid var(--border-color, #30363d);
      border-radius: 12px; margin-bottom: 1rem;
    }
    .conv-summary-file { display: flex; align-items: center; gap: 0.75rem; }
    .conv-file-icon { font-size: 1.6rem; flex-shrink: 0; }
    .conv-summary-file small, .conv-summary-type small { display: block; font-size: 0.72rem; color: var(--text-secondary, #8b949e); margin-bottom: 0.2rem; }
    .conv-summary-file b { font-size: 0.875rem; word-break: break-all; }
    .conv-type-badges { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .conv-mid-arrow { color: var(--text-secondary, #8b949e); }
    .conv-label-text { font-size: 0.82rem; color: var(--text-secondary, #8b949e); }
    .conv-warn { color: var(--warning, #fbbf24); background: rgba(251,191,36,.08); border: 1px solid rgba(251,191,36,.3); border-radius: 8px; padding: .55rem .8rem; font-size: .82rem; margin: 0; }

    .msg { padding: .55rem .8rem; border-radius: 8px; background: rgba(251,191,36,.08); border: 1px solid rgba(251,191,36,.3); font-size: .85rem; color: var(--warning, #fbbf24); margin: .5rem 0; }
    .msg--ok { background: rgba(52,211,153,.08); border-color: rgba(52,211,153,.3); color: var(--success, #34d399); }

    .progress-wrap { margin: .75rem 0; text-align: center; }
    .progress-bar { height: 3px; background: var(--bg-tertiary,#1c2333); border-radius: 2px; overflow: hidden; margin-bottom: .4rem; }
    .progress-fill {
      height: 100%; background: linear-gradient(90deg, var(--accent,#6c63ff), #a855f7); border-radius: 2px;
      animation: prog 1.4s ease-in-out infinite;
    }
    @keyframes prog { 0% { width: 0; margin-left: 0; } 50% { width: 60%; margin-left: 20%; } 100% { width: 0; margin-left: 100%; } }

    .ac { display: flex; justify-content: flex-end; gap: .6rem; margin-top: 1.25rem; }
    .btn { padding: .55rem 1.1rem; border-radius: 9px; border: 1px solid transparent; font-family: inherit; font-size: .875rem; font-weight: 500; cursor: pointer; transition: opacity .15s, transform .1s; }
    .btn:disabled { opacity: .45; cursor: not-allowed; }
    .btn:not(:disabled):active { transform: scale(.97); }
    .btn-p { background: var(--accent, #6c63ff); color: #fff; font-weight: 600; }
    .btn-p:not(:disabled):hover { background: #5851e5; }
    .btn-s { background: transparent; color: var(--text-primary, #e6edf3); border-color: var(--border-color, #30363d); }
    .btn-s:hover { background: var(--bg-tertiary, #1c2333); }

    @media (max-width: 600px) {
      .cp-page { padding: 1rem; }
      .cp-title { font-size: 1.35rem; }
      .cp-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
      .meta { grid-template-columns: 1fr; }
      .ac { flex-direction: column; align-items: stretch; }
    }
  `],
})
export class ConvertComponent implements OnDestroy {
  private readonly svc = inject(ConversionService);
  private readonly san = inject(DomSanitizer);
  private readonly t   = inject(TranslateService);

  readonly searchQuery = signal('');
  readonly favorites   = signal<Set<string>>(this.loadFavs());
  readonly totalCount  = CONVERSION_TYPES.length;

  private readonly allGroups = (() => {
    const map = new Map<string, ConversionDef[]>();
    for (const c of CONVERSION_TYPES as unknown as ConversionDef[]) {
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group)!.push(c);
    }
    return [...map.entries()].map(([name, items]) => ({
      name,
      icon:    GROUP_META[name]?.icon    ?? '📁',
      nameKey: GROUP_META[name]?.nameKey ?? name,
      descKey: GROUP_META[name]?.descKey ?? '',
      items,
    }));
  })();

  readonly visibleGroups = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.allGroups;
    return this.allGroups
      .map(g => ({
        ...g,
        items: g.items.filter(c =>
          c.label.toLowerCase().includes(q) ||
          c.from.toLowerCase().includes(q) ||
          c.to.toLowerCase().includes(q) ||
          g.name.toLowerCase().includes(q),
        ),
      }))
      .filter(g => g.items.length > 0);
  });

  readonly favoriteItems = computed(() => {
    const favs = this.favorites();
    return (CONVERSION_TYPES as unknown as ConversionDef[]).filter(c => favs.has(c.id));
  });

  // Modal state
  readonly openModal   = signal(false);
  readonly selectedDef = signal<ConversionDef | null>(null);
  readonly step        = signal<Step>('preview');
  readonly run         = signal(false);
  readonly file        = signal<File | null>(null);
  readonly kind        = signal<Kind>('unknown');
  readonly meta        = signal<{ name: string; size: string; type: string; pages: number | null } | null>(null);
  readonly txt         = signal('');
  readonly img         = signal<string | null>(null);
  readonly pdf         = signal<SafeResourceUrl | null>(null);
  readonly msg         = signal('');
  readonly hint        = signal('');
  readonly msgOk       = signal(false);

  private url: string | null = null;
  private ext = '';
  private b64: string | null = null;
  private done = false;

  readonly canConvert = computed(() => {
    const def = this.selectedDef();
    const f   = this.file();
    if (!def || !f || this.run()) return false;
    if (def.id.startsWith('base64-')) return Boolean(this.b64);
    if (!def.accept || def.accept === '*') return true;
    const exts = def.accept.split(',').map(a => a.trim().replace('.', '').toLowerCase());
    return exts.includes(this.ext.toLowerCase()) || exts.some(e => f.type.includes(e));
  });

  ngOnDestroy(): void { this.clean(); }

  open(def: ConversionDef): void {
    this.clean();
    this.selectedDef.set(def);
    this.openModal.set(true);
    this.step.set('preview');
    this.file.set(null);
    this.meta.set(null);
    this.kind.set('unknown');
    this.txt.set('');
    this.msg.set('');
    this.hint.set('');
    this.msgOk.set(false);
    this.done = false;
    this.b64  = null;
    this.ext  = '';
  }

  toggleFav(event: Event, id: string): void {
    event.stopPropagation();
    const next = new Set(this.favorites());
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    this.favorites.set(next);
    this.saveFavs(next);
  }

  back(): void { this.step.set('preview'); this.msg.set(''); this.msgOk.set(false); }

  tryClose(): void {
    if (this.run()) return;
    if (this.file() && !this.done && !confirm(this.t.instant('convert.close_confirm'))) return;
    this.openModal.set(false);
  }

  select(e: Event): void { this.load((e.target as HTMLInputElement).files?.[0] ?? null); }
  drop(e: DragEvent): void { e.preventDefault(); this.load(e.dataTransfer?.files?.[0] ?? null); }

  confirm(): void {
    if (!this.file()) return;
    this.step.set('convert');
    this.msg.set('');
    this.msgOk.set(false);
  }

  convert(): void {
    const def = this.selectedDef();
    if (!def || !this.canConvert()) return;

    this.run.set(true);
    this.msg.set(this.t.instant('convert.in_progress'));
    this.msgOk.set(false);
    this.done = false;

    if (def.id.startsWith('base64-')) {
      this.svc.convertBase64(def.id as ConversionTypeId, this.b64 ?? '').subscribe({
        next: (b) => {
          this.download(b, def.to.toLowerCase());
          this.done = true;
          this.run.set(false);
          this.msg.set(this.t.instant('convert.success'));
          this.msgOk.set(true);
        },
        error: (err) => { this.run.set(false); this.msg.set(this.errMsg(err)); },
      });
      return;
    }

    const f = this.file();
    if (!f) { this.run.set(false); this.msg.set(this.t.instant('convert.no_file')); return; }

    this.svc.convertFiles(def.id as ConversionTypeId, [f]).subscribe({
      next: (ev) => {
        if (ev.type === HttpEventType.Response && ev instanceof HttpResponse) {
          if (ev.body instanceof Blob) {
            this.download(ev.body, this.outputExt(def));
            this.done = true;
            this.msg.set(this.t.instant('convert.success'));
            this.msgOk.set(true);
          } else {
            this.msg.set(this.t.instant('convert.payload_not_downloadable'));
          }
          this.run.set(false);
        }
      },
      error: (err) => { this.run.set(false); this.msg.set(this.errMsg(err)); },
    });
  }

  private errMsg(err: { status?: number; error?: { message?: string } | Blob }): string {
    const status = err?.status ?? 0;
    const label  = status ? ` (HTTP ${status})` : '';
    if (status === 401 || status === 403) return `❌ ${this.t.instant('convert.err_unauthorized')}`;
    if (status === 413) return `❌ ${this.t.instant('convert.err_too_large')}`;
    if (status === 415) return `❌ ${this.t.instant('convert.err_unsupported')}`;
    if (err?.error instanceof Blob) {
      err.error.text().then(text => {
        try {
          const parsed = JSON.parse(text) as { message?: string };
          const detail = Array.isArray(parsed?.message) ? parsed.message.join('; ') : (parsed?.message ?? '');
          if (detail) this.msg.set(`❌ ${detail}${label}`);
        } catch { /* not JSON */ }
      });
      return `❌ ${this.t.instant('convert.err_failed')}${label}`;
    }
    if (typeof err?.error?.message === 'string') return `❌ ${err.error.message}${label}`;
    if (status === 400) return `❌ ${this.t.instant('convert.err_invalid')}${label}`;
    return `❌ ${this.t.instant('convert.err_failed')}${label}`;
  }

  private outputExt(def: ConversionDef): string {
    const m: Record<string, string> = { 'B64': 'txt', 'ZIP': 'zip' };
    return m[def.to] ?? def.to.toLowerCase();
  }

  private async load(f: File | null): Promise<void> {
    if (!f) return;
    this.clean();
    this.file.set(f);
    this.step.set('preview');
    this.msg.set('');
    this.msgOk.set(false);
    this.done = false;
    this.b64  = null;

    this.ext = this.extOf(f.name);
    const k  = this.detect(f);
    this.kind.set(k);
    this.meta.set({ name: f.name, size: this.bytes(f.size), type: f.type || 'unknown', pages: null });

    if (k === 'pdf' || k === 'image') this.url = URL.createObjectURL(f);

    if (k === 'pdf' && this.url) {
      this.pdf.set(this.san.bypassSecurityTrustResourceUrl(this.url));
      this.img.set(null);
      this.txt.set('');
    } else if (k === 'image' && this.url) {
      this.img.set(this.url);
      this.pdf.set(null);
      this.txt.set('');
    } else if (k === 'text' || k === 'base64') {
      this.img.set(null);
      this.pdf.set(null);
      const t = await f.text();
      this.txt.set(t.slice(0, 5000));
      if (k === 'base64') this.b64 = this.parseB64(t);
    } else {
      this.img.set(null);
      this.pdf.set(null);
      this.txt.set('');
    }
    this.hint.set(this.ai(f.name, k));
  }

  private detect(f: File): Kind {
    const m = f.type.toLowerCase();
    const e = this.extOf(f.name);
    if (m.includes('pdf') || e === 'pdf') return 'pdf';
    if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(e)) return 'image';
    if (['csv', 'json', 'txt', 'md', 'html', 'htm'].includes(e)) return 'text';
    if (e === 'b64' || e === 'base64') return 'base64';
    return 'unknown';
  }

  private ai(name: string, k: Kind): string {
    const n = name.toLowerCase();
    if (n.includes('invoice') || n.includes('fattura'))    return this.t.instant('convert.hint_invoice');
    if (n.includes('contract') || n.includes('contratto')) return this.t.instant('convert.hint_contract');
    if (k === 'pdf')           return this.t.instant('convert.hint_pdf');
    if (k === 'image')         return this.t.instant('convert.hint_image');
    if (this.ext === 'csv')    return this.t.instant('convert.hint_csv');
    if (this.ext === 'json')   return this.t.instant('convert.hint_json');
    return '';
  }

  private extOf(n: string): string {
    const p = n.toLowerCase().split('.');
    return p.length > 1 ? p[p.length - 1] : '';
  }

  private parseB64(v: string): string | null {
    const t = v.trim();
    if (!t) return null;
    if (t.startsWith('data:')) {
      const c = t.indexOf(',');
      return c >= 0 ? t.slice(c + 1) : null;
    }
    const x = t.replace(/\s+/g, '');
    return /^[A-Za-z0-9+/=]+$/.test(x) ? x : null;
  }

  private bytes(s: number): string {
    if (s === 0) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(s) / Math.log(1024)), u.length - 1);
    const v = s / 1024 ** i;
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
  }

  private download(b: Blob, e: string): void {
    const n = this.file()?.name.replace(/\.[^.]+$/, '') || 'converted-file';
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u;
    a.download = `${n}.${e}`;
    a.click();
    URL.revokeObjectURL(u);
  }

  private clean(): void {
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    this.img.set(null);
    this.pdf.set(null);
  }

  private loadFavs(): Set<string> {
    try {
      const raw = localStorage.getItem('convert-favs');
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  }

  private saveFavs(favs: Set<string>): void {
    try { localStorage.setItem('convert-favs', JSON.stringify([...favs])); } catch { /* storage unavailable */ }
  }
}
