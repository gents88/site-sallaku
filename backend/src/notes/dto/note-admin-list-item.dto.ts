export class NoteAdminListItemDto {
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

  createdAt: Date;
}
