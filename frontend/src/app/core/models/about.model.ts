export interface About {
  _id?: string;
  headline: string;
  bio: string;
  location: string;
  avatarUrl: string;
  resumeUrl: string;
  skills: string[];
  socials: {
    github?: string;
    linkedin?: string;
    twitter?: string;
    email?: string;
  };
}

export type UpdateAboutPayload = Partial<About>;
