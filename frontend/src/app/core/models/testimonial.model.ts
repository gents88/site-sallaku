export interface Testimonial {
  id: string;
  authorName: string;
  role?: string;
  companyUrl?: string;
  rating: number;
  content: string;
  avatarUrl?: string;
  featured: boolean;
  createdAt: string;
}

export interface TestimonialsResponse {
  data: Testimonial[];
  total: number;
}

export interface CreateTestimonialPayload {
  authorName: string;
  role?: string;
  companyUrl?: string;
  email?: string;
  rating: number;
  content: string;
  avatarUrl?: string;
  website?: string;
  honeypot?: string;
}
