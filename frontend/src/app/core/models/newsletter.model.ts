export type NewsletterStatus = 'pending' | 'confirmed' | 'unsubscribed';

export interface NewsletterActionResponse {
  message: string;
}

export interface NewsletterTokenResponse {
  email: string;
}

export interface NewsletterSubscriber {
  _id: string;
  email: string;
  status: NewsletterStatus;
  createdAt: string;
  confirmedAt?: string | null;
}

export interface NewsletterSubscribersResponse {
  data: NewsletterSubscriber[];
  total: number;
  page: number;
  totalPages: number;
}

export interface NewsletterCounts {
  pending: number;
  confirmed: number;
  unsubscribed: number;
  total: number;
}
