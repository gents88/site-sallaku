import { Injectable } from '@nestjs/common';
import { CreateNoteDto } from '../dto/create-note.dto';

@Injectable()
export class SpamDetectionService {
  private spamKeywords = [
    'viagra',
    'casino',
    'lottery',
    'click here',
    'buy now',
    'limited time',
    'free money',
    'work from home',
    'make money fast',
  ];

  private suspiciousPatterns = [
    /https?:\/\/[^\s]+/g,
    /[A-Z]{5,}/g,
  ];

  detectSpam(dto: CreateNoteDto, userIp?: string): { isSpam: boolean; score: number } {
    let score = 0;

    if (dto.honeypot) {
      return { isSpam: true, score: 100 };
    }

    const contentLower = dto.content.toLowerCase();

    for (const keyword of this.spamKeywords) {
      if (contentLower.includes(keyword)) {
        score += 30;
      }
    }

    for (const pattern of this.suspiciousPatterns) {
      const matches = contentLower.match(pattern);
      if (matches) {
        score += matches.length * 20;
      }
    }

    if (dto.website && dto.website.length > 0) {
      score += 25;
    }

    if (dto.content.length > 500) {
      score += 5;
    }

    if (!dto.name && !dto.email) {
      score += 10;
    }

    return {
      isSpam: score >= 50,
      score: Math.min(score, 100),
    };
  }

  validateEmailFormat(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  sanitizeContent(content: string): string {
    return content
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}
