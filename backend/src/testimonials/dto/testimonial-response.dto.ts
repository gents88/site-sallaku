import { Exclude } from 'class-transformer';

export class TestimonialResponseDto {
  id: string;

  authorName: string;

  role?: string;

  companyUrl?: string;

  rating: number;

  content: string;

  avatarUrl?: string;

  featured: boolean;

  createdAt: Date;

  @Exclude()
  email?: string;

  @Exclude()
  isApproved: boolean;

  @Exclude()
  isSpam: boolean;

  @Exclude()
  userIp: string;

  @Exclude()
  spamScore: number;
}
