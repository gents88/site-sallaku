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

  /** Identità controllata dall'admin: mostra il badge "verificata". */
  verified: boolean;

  /** Profilo LinkedIn: presente solo se `verified` (vedi TestimonialsService.mapToResponseDto). */
  linkedinUrl?: string;

  createdAt: Date;

  @Exclude()
  verifiedAt?: Date | null;

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
