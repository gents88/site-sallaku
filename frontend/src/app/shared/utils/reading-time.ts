const WORDS_PER_MINUTE = 200;

/** Estimated minutes to read an HTML/plain-text article (min 1). */
export function estimateReadingMinutes(content: string | null | undefined): number {
  const text = (content ?? '').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
