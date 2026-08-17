/**
 * Escapes plain text for safe embedding inside server-constructed HTML
 * markup (e.g. wrapping an AI-generated title in `<h1>...</h1>`).
 *
 * This is a different job from `SpamDetectionService.sanitizeContent()`,
 * which strips/neutralizes potentially-malicious HTML out of untrusted
 * user-submitted content (notes, testimonials) — this one assumes the
 * input is plain text and just needs entity-encoding before concatenation
 * into a new HTML string. Order matters: `&` must be escaped first, or a
 * later replace would double-encode the `&` it just introduced.
 */
export function escapeHtmlEntities(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
