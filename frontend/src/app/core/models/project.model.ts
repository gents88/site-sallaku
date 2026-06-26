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
}

export type UpdateProjectPayload = Partial<CreateProjectPayload>;
