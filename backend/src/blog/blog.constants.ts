export const BLOG_LANGUAGES = ['it', 'en', 'sq', 'pt', 'es', 'fr', 'de'] as const;

export type BlogLanguage = (typeof BLOG_LANGUAGES)[number];

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