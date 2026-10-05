import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Post, PostDocument } from '../../blog/schemas/post.schema';
import { Project, ProjectDocument } from '../../projects/schemas/project.schema';
import { SearchHit, SearchParams, SearchProvider, SearchResult } from '../interfaces/search.interface';
import { escapeRegex } from '../../common/utils/escape-regex';

/** Post field-name suffix for each blog language — '' (no suffix) is the Italian base copy. */
const LANG_SUFFIX: Record<string, string> = { it: '', en: '_en', sq: '_sq', es: '_es', pt: '_pt', fr: '_fr', de: '_de' };

/** Per-collection scan cap before in-memory merge/sort/paginate — generous for this site's content scale. */
const MAX_SCAN = 300;

type ScoredHit = SearchHit & { score: number };

const POST_FIELDS = 'title excerpt title_en excerpt_en title_sq excerpt_sq title_es excerpt_es title_pt excerpt_pt title_fr excerpt_fr title_de excerpt_de tags slug publishedAt updatedAt';
const PROJECT_FIELDS = 'title description technologies slug problem solution results translations updatedAt';
const TRANSLATED_LANGS = ['en', 'sq', 'es', 'pt', 'fr', 'de'];

/** $text ignora i termini troppo corti/parziali: sotto i 3 caratteri si va direttamente di regex. */
function hasIndexableTerm(q: string): boolean {
  return q.split(/\s+/).some((w) => w.length >= 3);
}


/** First non-empty of the requested-language field, falling back to the Italian base field. */
function pickField(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value : fallback;
}

@Injectable()
export class MongoSearchProvider implements SearchProvider {
  private readonly logger = new Logger(MongoSearchProvider.name);

  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
  ) {}

  async search(params: SearchParams): Promise<SearchResult> {
    const { q, lang, type, page, limit, mode = 'full' } = params;
    const pattern = new RegExp(escapeRegex(q), 'i');

    // Ricerca completa: indice full-text (pertinenza pesata su titolo/tag),
    // invece della vecchia regex non ancorata che scansionava ogni documento.
    // Se non trova nulla (parola parziale, es. "angu") si ripiega sulla regex.
    let posts: ScoredHit[] = [];
    let projects: ScoredHit[] = [];
    if (mode === 'full' && hasIndexableTerm(q)) {
      try {
        [posts, projects] = await Promise.all([
          type === 'project' ? Promise.resolve([]) : this.textSearchPosts(q, lang),
          type === 'post' ? Promise.resolve([]) : this.textSearchProjects(q, lang),
        ]);
      } catch (err) {
        // Indice full-text assente o non ancora creato (es. "text index required for
        // $text query", o un altro indice text già presente sulla collection): la
        // ricerca non deve andare in 500, si ripiega sulla scansione regex.
        this.logger.warn(`Full-text search unavailable, falling back to regex: ${(err as Error).message}`);
        posts = [];
        projects = [];
      }
    }
    if (posts.length + projects.length === 0) {
      [posts, projects] = await Promise.all([
        type === 'project' ? Promise.resolve([]) : this.searchPosts(pattern, lang),
        type === 'post' ? Promise.resolve([]) : this.searchProjects(pattern, lang),
      ]);
    }

    const merged = [...posts, ...projects].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

    const total = merged.length;
    const start = (page - 1) * limit;
    const data: SearchHit[] = merged.slice(start, start + limit).map(({ score: _score, ...hit }) => hit);

    return { data, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  /**
   * Matches against every language variant of title/excerpt/content (not just
   * `lang`) so a query finds a post even in a language it hasn't been
   * translated into yet; `lang` only picks which translation is *displayed*
   * for the hit, falling back to the Italian base copy when missing.
   */
  private async searchPosts(pattern: RegExp, lang?: string): Promise<ScoredHit[]> {
    const suffixes = Object.values(LANG_SUFFIX);
    const or = suffixes.flatMap((s) => [
      { [`title${s}`]: pattern },
      { [`excerpt${s}`]: pattern },
      { [`content${s}`]: pattern },
    ]);
    or.push({ tags: pattern });

    const docs = await this.postModel
      .find({ published: true, $or: or })
      .sort({ publishedAt: -1 })
      .limit(MAX_SCAN)
      .select(POST_FIELDS)
      .lean()
      .exec();

    return docs.map((doc: any): ScoredHit => {
      const hit = this.toPostHit(doc, lang);
      const titleMatch = pattern.test(hit.title);
      const tagMatch = hit.tags.some((t: string) => pattern.test(t));
      return { ...hit, score: titleMatch ? 2 : tagMatch ? 1.5 : 1 };
    });
  }

  private toPostHit(doc: any, lang?: string): SearchHit {
    const suffix = lang ? LANG_SUFFIX[lang] ?? '' : '';
    return {
      id: String(doc._id),
      type: 'post',
      title: pickField(doc[`title${suffix}`], doc.title),
      excerpt: pickField(doc[`excerpt${suffix}`], doc.excerpt),
      url: `/blog/${doc.slug}`,
      tags: doc.tags ?? [],
      updatedAt: doc.updatedAt ?? doc.publishedAt ?? new Date(0),
    };
  }

  private async textSearchPosts(q: string, lang?: string): Promise<ScoredHit[]> {
    const docs = await this.postModel
      .find({ published: true, $text: { $search: q } }, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(MAX_SCAN)
      .select(POST_FIELDS)
      .lean()
      .exec();
    return docs.map((doc: any) => ({ ...this.toPostHit(doc, lang), score: doc.score ?? 0 }));
  }

  private async textSearchProjects(q: string, lang?: string): Promise<ScoredHit[]> {
    const docs = await this.projectModel
      .find({ $text: { $search: q } }, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(MAX_SCAN)
      .select(PROJECT_FIELDS)
      .lean()
      .exec();
    return docs.map((doc: any) => ({ ...this.toProjectHit(doc, lang), score: doc.score ?? 0 }));
  }

  private async searchProjects(pattern: RegExp, lang?: string): Promise<ScoredHit[]> {
    const translated = TRANSLATED_LANGS.flatMap((l) => [
      { [`translations.${l}.title`]: pattern },
      { [`translations.${l}.description`]: pattern },
    ]);
    const docs = await this.projectModel
      .find({ $or: [{ title: pattern }, { description: pattern }, { technologies: pattern }, { problem: pattern }, { solution: pattern }, { results: pattern }, ...translated] })
      .sort({ order: 1 })
      .limit(MAX_SCAN)
      .select(PROJECT_FIELDS)
      .lean()
      .exec();

    return docs.map((doc: any): ScoredHit => {
      const hit = this.toProjectHit(doc, lang);
      return { ...hit, score: pattern.test(hit.title) ? 2 : 1 };
    });
  }

  /** Titolo/descrizione nella lingua richiesta (fallback italiano); link al case study se esiste. */
  private toProjectHit(doc: any, lang?: string): SearchHit {
    const tr = lang && lang !== 'it' ? doc.translations?.[lang] ?? {} : {};
    const hasCaseStudy = [doc.problem, doc.solution, doc.results].some((t: string | undefined) => t && t.trim());
    return {
      id: String(doc._id),
      type: 'project',
      title: pickField(tr.title, doc.title),
      excerpt: pickField(tr.description, doc.description),
      url: hasCaseStudy && doc.slug ? `/projects/${doc.slug}` : '/projects',
      tags: doc.technologies ?? [],
      updatedAt: doc.updatedAt ?? new Date(0),
    };
  }
}
