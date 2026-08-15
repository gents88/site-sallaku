export type NoteModerationStatus = 'pending' | 'approved' | 'spam' | 'all';

export interface AdminNote {
  id: string;
  articleId: string;
  articleTitle: string;
  articleSlug: string;
  name?: string;
  email?: string;
  content: string;
  isApproved: boolean;
  isSpam: boolean;
  spamScore: number;
  createdAt: string;
}

export interface AdminNotesResponse {
  data: AdminNote[];
  total: number;
}
