import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MailService } from '../mail/mail.service';
import { MailQueueService } from '../mail/mail-queue.service';
import { ContactDto } from './dto/contact.dto';
import { ContactMessage, ContactMessageDocument } from './schemas/contact-message.schema';

interface ContactCountByDay {
  date: string;
  count: number;
}

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    @InjectModel(ContactMessage.name)
    private contactModel: Model<ContactMessageDocument>,
    private mailService: MailService,
    private mailQueue: MailQueueService,
  ) {}

  async sendMessage(dto: ContactDto, meta?: { ip?: string; location?: string }): Promise<{ success: boolean }> {
    // Prevent obvious duplicates: same email+message within last 60s
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const duplicate = await this.contactModel.findOne({
      email: dto.email,
      message: dto.message,
      createdAt: { $gte: oneMinuteAgo },
    }).exec();

    if (duplicate) {
      this.logger.warn(`Duplicate contact detected for ${dto.email} — ignoring duplicate within window`);
      // Persisting a duplicate could be avoided; but still record it for audit
      await this.contactModel.create({ ...dto, duplicateOf: duplicate._id } as any);
      return { success: true };
    }

    // 1. Persist the message (authoritative store)
    const created = await this.contactModel.create(dto);

    // 2. Enqueue notification job (fast, reliable delivery via queue)
    try {
      await this.mailQueue.enqueueContact({
        name: dto.name,
        email: dto.email,
        subject: dto.subject,
        message: dto.message,
        contactId: String(created._id),
        ip: meta?.ip,
        location: meta?.location,
      });
    } catch (err) {
      this.logger.error('Failed to enqueue mail job', err as any);
      // Best-effort: still return success to the caller (optimistic UX) and worker will retry
    }

    return { success: true };
  }

  async count(): Promise<number> {
    return this.contactModel.countDocuments().exec();
  }

  async findAll(limit = 20) {
    return this.contactModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async markAsRead(id: string, read = true) {
    const message = await this.contactModel.findByIdAndUpdate(
      id,
      { read },
      { new: true },
    ).exec();

    if (!message) {
      throw new NotFoundException('Contact message not found');
    }

    return message;
  }

  async deleteMessage(id: string): Promise<{ success: boolean }> {
    const message = await this.contactModel.findByIdAndDelete(id).exec();

    if (!message) {
      throw new NotFoundException('Contact message not found');
    }

    return { success: true };
  }

  async deleteMany(ids: string[]): Promise<{ success: boolean; deleted: number }> {
    const result = await this.contactModel.deleteMany({ _id: { $in: ids } }).exec();
    return { success: true, deleted: result.deletedCount };
  }

  async countByDay(days = 7): Promise<ContactCountByDay[]> {
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const results = await this.contactModel.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          createdAt: {
            $gte: start,
            $lte: end,
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec();

    const counts = new Map(results.map(item => [item._id, item.count]));

    return Array.from({ length: days }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = date.toISOString().slice(0, 10);

      return {
        date: key,
        count: counts.get(key) ?? 0,
      };
    });
  }
}
