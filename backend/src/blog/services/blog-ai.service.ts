import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import slugify from 'slugify';
import {
  BlogLanguage,
  BLOG_LANGUAGE_LABELS,
  DEFAULT_BLOG_LANGUAGE,
} from '../blog.constants';
import { ExtractedPdfDocument } from './pdf-extraction.service';

interface FeaturedImageSuggestion {
  url: string;
  alt: string;
  prompt: string;
  source: 'placeholder' | 'ai-suggested';
}

export interface GeneratedBlogDraft {
  language: BlogLanguage;
  title: string;
  subtitle: string;
  excerpt: string;
  content: string;
  tags: string[];
  slug: string;
  metaTitle: string;
  metaDescription: string;
  coverImage: string;
  imageHandling: {
    extractedImages: Array<{ url: string; caption: string }>;
    featuredImageSuggestion: FeaturedImageSuggestion;
    manualUploadRecommended: boolean;
  };
  warnings: string[];
}

@Injectable()
export class BlogAiService {
  private readonly logger = new Logger(BlogAiService.name);

  constructor(private readonly configService: ConfigService) {}

  async generateDraft(
    document: ExtractedPdfDocument,
    language: BlogLanguage = DEFAULT_BLOG_LANGUAGE,
    context?: string,
  ): Promise<GeneratedBlogDraft> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      return this.buildFallbackDraft(document, language, [
        'OPENAI_API_KEY is not configured. A deterministic local draft was generated instead.',
      ]);
    }

    try {
      const response = await fetch(
        this.configService.get<string>('OPENAI_API_URL', 'https://api.openai.com/v1/chat/completions'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: this.configService.get<string>('OPENAI_MODEL', 'gpt-4.1-mini'),
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: [
                  'You generate high-quality blog drafts from PDF text.',
                  'Return JSON only.',
                  'Content must be clean HTML with a single <h1>, then meaningful <h2> and <h3> sections.',
                  'Use the requested language only.',
                  'Produce concise SEO metadata and 4-8 useful tags.',
                  'If the source document is noisy, rewrite for clarity while preserving factual meaning.',
                ].join(' '),
              },
              {
                role: 'user',
                content: this.buildPrompt(document, language, context),
              },
            ],
            temperature: 0.4,
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`AI provider error ${response.status}: ${errorBody}`);
      }

      const payload = await response.json();
      const rawContent = payload?.choices?.[0]?.message?.content;
      const parsed = this.parseJson(rawContent);

      return this.sanitizeDraft(parsed, document, language, []);
    } catch (error) {
      this.logger.warn(`Falling back to local PDF draft generation: ${String(error)}`);

      return this.buildFallbackDraft(document, language, [
        'The AI provider was unavailable, so a local draft was generated from the extracted PDF text.',
      ]);
    }
  }

  private buildPrompt(
    document: ExtractedPdfDocument,
    language: BlogLanguage,
    context?: string,
  ): string {
    return JSON.stringify(
      {
        task: 'Generate a structured blog draft from the extracted PDF text.',
        outputLanguage: BLOG_LANGUAGE_LABELS[language],
        additionalContext: context ?? '',
        responseShape: {
          title: 'string',
          subtitle: 'string',
          excerpt: 'string',
          content: 'HTML string with h1/h2/h3 structure',
          tags: ['string'],
          slug: 'seo-friendly-string',
          metaTitle: 'string',
          metaDescription: 'string',
          coverImageUrl: 'optional string',
          imagePrompt: 'string for a featured image suggestion',
        },
        constraints: [
          'Keep excerpt under 260 characters.',
          'Keep metaTitle under 60 characters if possible.',
          'Keep metaDescription under 160 characters if possible.',
          'Do not mention that the content came from a PDF.',
          'Make the article readable and publication-ready.',
        ],
        extractedText: document.rawText.slice(0, 18000),
      },
      null,
      2,
    );
  }

  private buildFallbackDraft(
    document: ExtractedPdfDocument,
    language: BlogLanguage,
    warnings: string[],
  ): GeneratedBlogDraft {
    const title = this.pickTitle(document.rawText);
    const subtitle = this.pickSubtitle(document.rawText, title);
    const excerpt = this.pickExcerpt(document.rawText);
    const tags = this.extractTags(document.rawText, language);
    const content = this.buildHtmlContent(title, document.rawText);

    return this.sanitizeDraft(
      {
        title,
        subtitle,
        excerpt,
        content,
        tags,
        slug: slugify(title, { lower: true, strict: true }),
        metaTitle: title,
        metaDescription: excerpt,
        imagePrompt: `Editorial featured image about ${title}`,
      },
      document,
      language,
      warnings,
    );
  }

  private sanitizeDraft(
    rawDraft: Record<string, unknown>,
    document: ExtractedPdfDocument,
    language: BlogLanguage,
    warnings: string[],
  ): GeneratedBlogDraft {
    const title = this.cleanText(rawDraft.title, 120) || this.pickTitle(document.rawText);
    const subtitle = this.cleanText(rawDraft.subtitle, 180) || this.pickSubtitle(document.rawText, title);
    const excerpt = this.cleanText(rawDraft.excerpt, 260) || this.pickExcerpt(document.rawText);
    const slug = this.buildSlug(rawDraft.slug, title);
    const metaTitle = this.cleanText(rawDraft.metaTitle, 60) || title;
    const metaDescription = this.cleanText(rawDraft.metaDescription, 160) || excerpt;
    const tags = this.cleanTags(rawDraft.tags, language, document.rawText);
    const content = this.ensureHtml(rawDraft.content, title, excerpt, document.rawText);
    const imagePrompt = this.cleanText(rawDraft.imagePrompt, 200)
      || `Editorial featured image for ${title}`;
    const coverImage = this.cleanText(rawDraft.coverImageUrl, 500)
      || this.buildPlaceholderImage(title);

    return {
      language,
      title,
      subtitle,
      excerpt,
      content,
      tags,
      slug,
      metaTitle,
      metaDescription,
      coverImage,
      imageHandling: {
        extractedImages: [],
        featuredImageSuggestion: {
          url: coverImage,
          alt: title,
          prompt: imagePrompt,
          source: rawDraft.coverImageUrl ? 'ai-suggested' : 'placeholder',
        },
        manualUploadRecommended: true,
      },
      warnings: document.containsImages
        ? warnings
        : [...warnings, 'PDF image extraction is not enabled; upload a featured image manually if needed.'],
    };
  }

  private parseJson(rawContent: unknown): Record<string, unknown> {
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
      return {};
    }

    const normalized = rawContent
      .replace(/^```json\s*/i, '')
      .replace(/^```/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      return JSON.parse(normalized) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private ensureHtml(
    candidate: unknown,
    title: string,
    excerpt: string,
    sourceText: string,
  ): string {
    if (typeof candidate === 'string' && /<h1[\s>]/i.test(candidate) && /<h2[\s>]/i.test(candidate)) {
      return candidate.trim();
    }

    return this.buildHtmlContent(title, sourceText, excerpt);
  }

  private buildHtmlContent(title: string, sourceText: string, excerpt?: string): string {
    const paragraphs = sourceText
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 40)
      .slice(0, 8);

    const intro = excerpt ? `<p>${this.escapeHtml(excerpt)}</p>` : '';
    const sections = paragraphs.slice(0, 6).map((paragraph, index) => {
      const headingLevel = index === 0 ? 'h2' : index < 3 ? 'h2' : 'h3';
      const headingText = this.pickSectionHeading(paragraph, index);
      return `<${headingLevel}>${this.escapeHtml(headingText)}</${headingLevel}><p>${this.escapeHtml(paragraph)}</p>`;
    });

    return [`<h1>${this.escapeHtml(title)}</h1>`, intro, ...sections].filter(Boolean).join('\n');
  }

  private pickSectionHeading(paragraph: string, index: number): string {
    const words = paragraph.split(/\s+/).slice(0, 6).join(' ');
    return words || `Section ${index + 1}`;
  }

  private pickTitle(text: string): string {
    const sentence = text.split(/[\n.!?]+/).map((part) => part.trim()).find((part) => part.length > 20);
    return this.toTitleCase((sentence ?? 'New Blog Post').split(/\s+/).slice(0, 10).join(' '));
  }

  private pickSubtitle(text: string, title: string): string {
    const words = text.split(/\s+/).filter(Boolean).slice(0, 24).join(' ');
    return words && words.toLowerCase() !== title.toLowerCase()
      ? this.cleanText(words, 180)
      : `A concise overview of ${title.toLowerCase()}`;
  }

  private pickExcerpt(text: string): string {
    const sentence = text.split(/[.!?]+/).map((part) => part.trim()).find((part) => part.length > 80);
    return this.cleanText(sentence, 260) || this.cleanText(text, 260) || 'Publication-ready summary generated from the uploaded document.';
  }

  private extractTags(text: string, language: BlogLanguage): string[] {
    const stopWords = new Set([
      'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'have', 'into', 'about',
      'sono', 'della', 'delle', 'dallo', 'degli', 'nelle', 'questo', 'quella', 'perche',
      'dhe', 'nga', 'kete', 'kjo', 'nese', 'janë', 'është', 'shume', 'sipas', 'midis',
      language,
    ]);

    const counts = new Map<string, number>();
    for (const token of text.toLowerCase().match(/[a-zA-ZÀ-ÿ]{4,}/g) ?? []) {
      if (stopWords.has(token)) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([token]) => this.toTitleCase(token));
  }

  private cleanTags(rawTags: unknown, language: BlogLanguage, sourceText: string): string[] {
    if (Array.isArray(rawTags)) {
      const values = rawTags
        .map((tag) => this.cleanText(tag, 24))
        .filter((tag): tag is string => Boolean(tag));
      if (values.length) {
        return [...new Set(values)].slice(0, 8);
      }
    }

    return this.extractTags(sourceText, language).length ? this.extractTags(sourceText, language) : ['Blog'];
  }

  private cleanText(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  private buildSlug(candidate: unknown, title: string): string {
    const source = this.cleanText(candidate, 120) || title;
    return slugify(source, { lower: true, strict: true }) || `post-${Date.now()}`;
  }

  private buildPlaceholderImage(title: string): string {
    return `https://placehold.co/1200x630?text=${encodeURIComponent(title)}`;
  }

  private toTitleCase(value: string): string {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}