import { Exclude } from 'class-transformer';

export class NoteResponseDto {
  id: string;

  articleId: string;

  name?: string;

  email?: string;

  content: string;

  isApproved: boolean;

  @Exclude()
  isSpam: boolean;

  @Exclude()
  userIp: string;

  @Exclude()
  spamScore: number;

  createdAt: Date;

  updatedAt: Date;
}
