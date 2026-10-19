export interface Testimonial {
  id: string;
  authorName: string;
  role?: string;
  companyUrl?: string;
  rating: number;
  content: string;
  avatarUrl?: string;
  featured: boolean;
  /** Identità controllata dall'admin: mostra il badge "verificata". */
  verified?: boolean;
  /** Profilo LinkedIn dell'autore; il backend lo manda solo se `verified`. */
  linkedinUrl?: string;
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
  /** Facoltativo: serve all'admin per verificare l'autore; pubblico solo dopo la verifica. */
  linkedinUrl?: string;
  email?: string;
  rating: number;
  content: string;
  avatarUrl?: string;
  website?: string;
  honeypot?: string;
  turnstileToken?: string;
}
