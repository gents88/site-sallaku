import type { Lang } from '../services/language.service';
import type { Experience } from './experience.model';
import type { Project } from './project.model';

/**
 * Restituisce il contenuto nella lingua richiesta: ogni campo tradotto
 * sostituisce quello italiano, un campo mancante o vuoto ricade
 * sull'italiano (meglio il testo originale di un buco nella pagina).
 */
function localize<T extends object, F extends keyof T & string>(
  item: T,
  translations: Partial<Record<string, Partial<Record<F, string>>>> | undefined,
  fields: readonly F[],
  lang: Lang,
): T {
  if (lang === 'it') return item;
  const tr = translations?.[lang];
  if (!tr) return item;
  const out = { ...item };
  for (const f of fields) {
    const value = tr[f]?.trim();
    if (value) (out as Record<string, unknown>)[f] = value;
  }
  return out;
}

export const PROJECT_TEXT_FIELDS = ['title', 'description', 'problem', 'solution', 'results'] as const;
export const EXPERIENCE_TEXT_FIELDS = ['role', 'description', 'location'] as const;

export function localizeProject(project: Project, lang: Lang): Project {
  return localize(project, project.translations, PROJECT_TEXT_FIELDS, lang);
}

export function localizeExperience(experience: Experience, lang: Lang): Experience {
  return localize(experience, experience.translations, EXPERIENCE_TEXT_FIELDS, lang);
}

/** Un progetto ha una pagina di dettaglio solo se ha qualcosa in più da raccontare della card. */
export function hasCaseStudy(project: Project): boolean {
  return !!(project.slug && (project.problem?.trim() || project.solution?.trim() || project.results?.trim()));
}
