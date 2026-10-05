export const BLOG_LANGUAGES = ['it', 'en', 'sq', 'pt', 'es', 'fr', 'de'] as const;

export type BlogLanguage = (typeof BLOG_LANGUAGES)[number];

/** Languages with their own title_xx/slug_xx fields (Italian is the base `title`/`slug`). */
export const TRANSLATED_BLOG_LANGUAGES = ['en', 'sq', 'pt', 'es', 'fr', 'de'] as const;

/** Every field a post can be looked up by in a public URL. */
export const BLOG_SLUG_FIELDS = ['slug', ...TRANSLATED_BLOG_LANGUAGES.map(l => `slug_${l}` as const)] as const;

export const DEFAULT_BLOG_LANGUAGE: BlogLanguage = 'en';

export const BLOG_LANGUAGE_LABELS: Record<BlogLanguage, string> = {
  it: 'Italian',
  en: 'English',
  sq: 'Albanian',
  pt: 'Portuguese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
};

export const MAX_PDF_UPLOAD_SIZE = 10 * 1024 * 1024;