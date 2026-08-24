import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { Testimonial, TestimonialDocument } from '../schemas/testimonial.schema';
import { CreateTestimonialDto } from '../dto/create-testimonial.dto';
import { TestimonialResponseDto } from '../dto/testimonial-response.dto';
import { TestimonialAdminItemDto } from '../dto/testimonial-admin-item.dto';
import { SpamDetectionService } from '../../common/services/spam-detection.service';
import { TurnstileService } from '../../common/services/turnstile.service';

export type TestimonialModerationStatus = 'pending' | 'approved' | 'spam' | 'all';

@Injectable()
export class TestimonialsService {
  constructor(
    @InjectModel(Testimonial.name) private testimonialModel: Model<TestimonialDocument>,
    private spamDetectionService: SpamDetectionService,
    private turnstile: TurnstileService,
  ) {}

  async createTestimonial(
    dto: CreateTestimonialDto,
    userIp?: string,
  ): Promise<TestimonialResponseDto> {
    if (!(await this.turnstile.verify(dto.turnstileToken, userIp))) {
      throw new BadRequestException('Verifica anti-spam non superata. Riprova.');
    }

    // Absorb accidental double-submits (double click) before they even reach the throttler.
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const duplicate = await this.testimonialModel
      .findOne({
        authorName: dto.authorName,
        content: dto.content,
        createdAt: { $gte: oneMinuteAgo },
      })
      .exec();

    if (duplicate) {
      return this.mapToResponseDto(duplicate);
    }

    const { isSpam, score } = this.spamDetectionService.detectSpam({
      content: dto.content,
      name: dto.authorName,
      email: dto.email,
      honeypot: dto.honeypot,
      website: dto.website,
    });

    if (isSpam && score >= 80) {
      throw new BadRequestException('La testimonianza è stata contrassegnata come spam');
    }

    const sanitizedContent = this.spamDetectionService.sanitizeContent(dto.content);

    const testimonial = new this.testimonialModel({
      authorName: dto.authorName,
      role: dto.role || null,
      companyUrl: dto.companyUrl || null,
      email: dto.email || null,
      rating: dto.rating,
      content: sanitizedContent,
      avatarUrl: dto.avatarUrl || null,
      isSpam: isSpam && score >= 50,
      spamScore: score,
      userIp: userIp || null,
      // Testimonials are reputational, public-facing content that may be
      // surfaced in indexed Review structured data — always require human
      // review before publication, unlike the lighter-weight notes flow.
      isApproved: false,
      featured: false,
    });

    const saved = await testimonial.save();
    return this.mapToResponseDto(saved);
  }

  async getApproved(
    limit = 20,
    skip = 0,
    featuredOnly = false,
  ): Promise<{ data: TestimonialResponseDto[]; total: number }> {
    const query: Record<string, unknown> = {
      isApproved: true,
      isSpam: false,
      ...(featuredOnly ? { featured: true } : {}),
    };

    const [testimonials, total] = await Promise.all([
      this.testimonialModel.find(query).sort({ createdAt: -1 }).limit(limit).skip(skip).exec(),
      this.testimonialModel.countDocuments(query),
    ]);

    return {
      data: testimonials.map((t) => this.mapToResponseDto(t)),
      total,
    };
  }

  async getFeatured(limit = 6): Promise<TestimonialResponseDto[]> {
    const { data } = await this.getApproved(limit, 0, true);
    return data;
  }

  async getStats(): Promise<{
    total: number;
    approved: number;
    pending: number;
    spam: number;
    featured: number;
  }> {
    const [total, approved, pending, spam, featured] = await Promise.all([
      this.testimonialModel.countDocuments({}),
      this.testimonialModel.countDocuments({ isApproved: true, isSpam: false }),
      this.testimonialModel.countDocuments({ isApproved: false, isSpam: false }),
      this.testimonialModel.countDocuments({ isSpam: true }),
      this.testimonialModel.countDocuments({ isApproved: true, isSpam: false, featured: true }),
    ]);

    return { total, approved, pending, spam, featured };
  }

  async getAllForAdmin(
    status: TestimonialModerationStatus = 'pending',
    limit = 50,
    skip = 0,
  ): Promise<{ data: TestimonialAdminItemDto[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (status === 'pending') {
      query.isApproved = false;
      query.isSpam = false;
    } else if (status === 'approved') {
      query.isApproved = true;
      query.isSpam = false;
    } else if (status === 'spam') {
      query.isSpam = true;
    }
    // 'all' → no filter

    const [testimonials, total] = await Promise.all([
      this.testimonialModel.find(query).sort({ createdAt: -1 }).limit(limit).skip(skip).exec(),
      this.testimonialModel.countDocuments(query),
    ]);

    return {
      data: testimonials.map((t) => this.mapToAdminDto(t)),
      total,
    };
  }

  async getById(id: string): Promise<TestimonialAdminItemDto> {
    const testimonial = await this.findOrThrow(id);
    return this.mapToAdminDto(testimonial);
  }

  async updateApprovalStatus(id: string, isApproved: boolean): Promise<TestimonialAdminItemDto> {
    this.assertValidId(id);
    const testimonial = await this.testimonialModel.findByIdAndUpdate(
      id,
      { isApproved, updatedAt: new Date() },
      { new: true },
    );
    if (!testimonial) throw new NotFoundException('Testimonianza non trovata');
    return this.mapToAdminDto(testimonial);
  }

  async updateContent(id: string, content: string): Promise<TestimonialAdminItemDto> {
    this.assertValidId(id);
    const sanitized = this.spamDetectionService.sanitizeContent(content);
    const testimonial = await this.testimonialModel.findByIdAndUpdate(
      id,
      { content: sanitized, updatedAt: new Date() },
      { new: true },
    );
    if (!testimonial) throw new NotFoundException('Testimonianza non trovata');
    return this.mapToAdminDto(testimonial);
  }

  async setFeatured(id: string, featured: boolean): Promise<TestimonialAdminItemDto> {
    this.assertValidId(id);
    const testimonial = await this.testimonialModel.findByIdAndUpdate(
      id,
      { featured, updatedAt: new Date() },
      { new: true },
    );
    if (!testimonial) throw new NotFoundException('Testimonianza non trovata');
    return this.mapToAdminDto(testimonial);
  }

  async markAsSpam(id: string): Promise<TestimonialAdminItemDto> {
    this.assertValidId(id);
    const testimonial = await this.testimonialModel.findByIdAndUpdate(
      id,
      { isSpam: true, updatedAt: new Date() },
      { new: true },
    );
    if (!testimonial) throw new NotFoundException('Testimonianza non trovata');
    return this.mapToAdminDto(testimonial);
  }

  async delete(id: string): Promise<void> {
    this.assertValidId(id);
    const result = await this.testimonialModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('Testimonianza non trovata');
  }

  private async findOrThrow(id: string): Promise<TestimonialDocument> {
    this.assertValidId(id);
    const testimonial = await this.testimonialModel.findById(id).exec();
    if (!testimonial) throw new NotFoundException('Testimonianza non trovata');
    return testimonial;
  }

  private assertValidId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID non valido');
    }
  }

  private mapToResponseDto(testimonial: TestimonialDocument): TestimonialResponseDto {
    const dto = plainToInstance(TestimonialResponseDto, testimonial.toObject());
    dto.id = testimonial._id.toString();
    return dto;
  }

  private mapToAdminDto(testimonial: TestimonialDocument): TestimonialAdminItemDto {
    return {
      id: testimonial._id.toString(),
      authorName: testimonial.authorName,
      role: testimonial.role,
      companyUrl: testimonial.companyUrl,
      email: testimonial.email,
      rating: testimonial.rating,
      content: testimonial.content,
      avatarUrl: testimonial.avatarUrl,
      isApproved: testimonial.isApproved,
      isSpam: testimonial.isSpam,
      spamScore: testimonial.spamScore,
      featured: testimonial.featured,
      userIp: testimonial.userIp,
      createdAt: testimonial.createdAt,
    };
  }
}
