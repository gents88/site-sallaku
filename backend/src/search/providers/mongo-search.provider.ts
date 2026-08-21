import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Post, PostDocument } from '../../blog/schemas/post.schema';
import { Project, ProjectDocument } from '../../projects/schemas/project.schema';
import { SearchHit, SearchParams, SearchProvider, SearchResult } from '../interfaces/search.interface';

/** Post field-name suffix for each blog language — '' (no suffix) is the Italian base copy. */
const LANG_SUFFIX: Record<string, string> = { it: '', en: '_en', sq: '_sq', es: '_es', pt: '_pt', fr: '_fr', de: '_de' };

/** Per-collection scan cap before in-memory merge/sort/paginate — generous for this site's content scale. */
const MAX_SCAN = 300;

type ScoredHit = SearchHit & { score: number };

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** First non-empty of the requested-language field, falling back to the Italian base field. */
function pickField(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value : fallback;
}

@Injectable()
export class MongoSearchProvider implements SearchProvider {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
  ) {}

  async search(params: SearchParams): Promise<SearchResult> {
    const { q, lang, type, page, limit } = params;
    const pattern = new RegExp(escapeRegex(q), 'i');

    const [posts, projects] = await Promise.all([
      type === 'project' ? Promise.resolve([]) : this.searchPosts(pattern, lang),
      type === 'post' ? Promise.resolve([]) : this.searchProjects(pattern),
    ]);

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
      .select('title excerpt title_en excerpt_en title_sq excerpt_sq title_es excerpt_es title_pt excerpt_pt title_fr excerpt_fr title_de excerpt_de tags slug publishedAt updatedAt')
      .lean()
      .exec();

    const suffix = lang ? LANG_SUFFIX[lang] ?? '' : '';
    return docs.map((doc: any): ScoredHit => {
      const title = pickField(doc[`title${suffix}`], doc.title);
      const excerpt = pickField(doc[`excerpt${suffix}`], doc.excerpt);
      const titleMatch = pattern.test(title);
      const tagMatch = (doc.tags ?? []).some((t: string) => pattern.test(t));
      return {
        id: String(doc._id),
        type: 'post',
        title,
        excerpt,
        url: `/blog/${doc.slug}`,
        tags: doc.tags ?? [],
        updatedAt: doc.updatedAt ?? doc.publishedAt ?? new Date(0),
        score: titleMatch ? 2 : tagMatch ? 1.5 : 1,
      };
    });
  }

  private async searchProjects(pattern: RegExp): Promise<ScoredHit[]> {
    const docs = await this.projectModel
      .find({ $or: [{ title: pattern }, { description: pattern }, { technologies: pattern }] })
      .sort({ order: 1 })
      .limit(MAX_SCAN)
      .select('title description technologies updatedAt')
      .lean()
      .exec();

    return docs.map((doc: any): ScoredHit => ({
      id: String(doc._id),
      type: 'project',
      title: doc.title,
      excerpt: doc.description,
      // No project detail route exists yet — results link back to the list page.
      url: '/projects',
      tags: doc.technologies ?? [],
      updatedAt: doc.updatedAt ?? new Date(0),
      score: pattern.test(doc.title) ? 2 : 1,
    }));
  }
}
