export type BlogLanguage = 'it' | 'en' | 'sq' | 'pt' | 'es' | 'fr' | 'de';

export interface Post {
  _id: string;
  title: string;
  subtitle: string;
  slug: string;
  language: BlogLanguage;
  content: string;
  excerpt: string;
  // Multilanguage translations
  title_en: string;
  title_sq: string;
  title_pt: string;
  content_en: string;
  content_sq: string;
  content_pt: string;
  excerpt_en: string;
  excerpt_sq: string;
  excerpt_pt: string;
  title_es: string;
  content_es: string;
  excerpt_es: string;
  title_fr: string;
  content_fr: string;
  excerpt_fr: string;
  title_de: string;
  content_de: string;
  excerpt_de: string;
  coverImage: string;
  tags: string[];
  published: boolean;
  publishedAt: string | null;
  metaTitle: string;
  metaDescription: string;
  viewCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PostSummary extends Omit<Post, 'content' | 'content_en' | 'content_sq' | 'content_pt' | 'content_es' | 'content_fr' | 'content_de'> {}

export interface CreatePostPayload {
  title: string;
  subtitle?: string;
  slug?: string;
  language?: BlogLanguage;
  content: string;
  excerpt?: string;
  coverImage?: string;
  tags?: string[];
  published?: boolean;
  metaTitle?: string;
  metaDescription?: string;
  // Multilanguage translations
  title_en?: string;
  title_sq?: string;
  title_pt?: string;
  content_en?: string;
  content_sq?: string;
  content_pt?: string;
  excerpt_en?: string;
  excerpt_sq?: string;
  excerpt_pt?: string;
  title_es?: string;
  content_es?: string;
  excerpt_es?: string;
  title_fr?: string;
  content_fr?: string;
  excerpt_fr?: string;
  title_de?: string;
  content_de?: string;
  excerpt_de?: string;
}

export type UpdatePostPayload = Partial<CreatePostPayload>;

export interface PdfExtractResult {
  fileName: string;
  sizeBytes: number;
  pageCount: number;
  wordCount: number;
  rawText: string;
  preview: string;
  containsImages: boolean;
}

export interface BlogPdfDraft {
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
    featuredImageSuggestion: {
      url: string;
      alt: string;
      prompt: string;
      source: 'placeholder' | 'ai-suggested';
    };
    manualUploadRecommended: boolean;
  };
  source: {
    fileName: string;
    pageCount: number;
    wordCount: number;
    sizeBytes: number;
    preview: string;
  };
  warnings: string[];
}

export interface BlogPdfDraft {
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
    featuredImageSuggestion: {
      url: string;
      alt: string;
      prompt: string;
      source: 'placeholder' | 'ai-suggested';
    };
    manualUploadRecommended: boolean;
  };
  source: {
    fileName: string;
    pageCount: number;
    wordCount: number;
    sizeBytes: number;
    preview: string;
  };
  warnings: string[];
}
