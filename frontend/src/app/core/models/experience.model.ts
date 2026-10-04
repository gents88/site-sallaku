import type { Lang } from '../services/language.service';

export type ExperienceTextField = 'role' | 'description' | 'location';
export type ExperienceTranslations = Partial<Record<Exclude<Lang, 'it'>, Partial<Record<ExperienceTextField, string>>>>;

export interface Experience {
  _id: string;
  company: string;
  role: string;
  startDate: string;
  endDate?: string;
  current: boolean;
  description: string;
  technologies: string[];
  location?: string;
  order: number;
  translations?: ExperienceTranslations;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExperiencePayload {
  company: string;
  role: string;
  startDate: string;
  endDate?: string;
  current?: boolean;
  description: string;
  technologies?: string[];
  location?: string;
  order?: number;
  translations?: ExperienceTranslations;
}

export type UpdateExperiencePayload = Partial<CreateExperiencePayload>;
