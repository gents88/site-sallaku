export type TestimonialModerationStatus = 'pending' | 'approved' | 'spam' | 'all';

export interface AdminTestimonial {
  id: string;
  authorName: string;
  role?: string;
  companyUrl?: string;
  email?: string;
  rating: number;
  content: string;
  avatarUrl?: string;
  isApproved: boolean;
  isSpam: boolean;
  spamScore: number;
  featured: boolean;
  userIp?: string;
  createdAt: string;
}

export interface AdminTestimonialsResponse {
  data: AdminTestimonial[];
  total: number;
}
