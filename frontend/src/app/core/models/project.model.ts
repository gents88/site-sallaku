import type { Lang } from '../services/language.service';

/** Campi testuali traducibili di un progetto (l'italiano sta nei campi base). */
export type ProjectTextField = 'title' | 'description' | 'problem' | 'solution' | 'results';
export type ProjectTranslations = Partial<Record<Exclude<Lang, 'it'>, Partial<Record<ProjectTextField, string>>>>;

export interface Project {
  _id: string;
  title: string;
  description: string;
  slug: string;
  technologies: string[];
  images: string[];
  liveUrl?: string;
  repoUrl?: string;
  featured: boolean;
  order: number;
  /** Case study (pagina /projects/:slug). */
  problem?: string;
  solution?: string;
  results?: string;
  translations?: ProjectTranslations;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectPayload {
  title: string;
  description: string;
  technologies?: string[];
  images?: string[];
  liveUrl?: string;
  repoUrl?: string;
  featured?: boolean;
  order?: number;
  problem?: string;
  solution?: string;
  results?: string;
  translations?: ProjectTranslations;
}

export type UpdateProjectPayload = Partial<CreateProjectPayload>;
