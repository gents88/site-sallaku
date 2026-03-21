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
}

export type UpdateExperiencePayload = Partial<CreateExperiencePayload>;
