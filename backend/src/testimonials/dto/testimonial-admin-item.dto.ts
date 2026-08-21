export class TestimonialAdminItemDto {
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

  createdAt: Date;
}
