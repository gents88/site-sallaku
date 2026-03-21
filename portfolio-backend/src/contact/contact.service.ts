import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MailService } from '../mail/mail.service';
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
  ) {}

  async sendMessage(dto: ContactDto): Promise<{ success: boolean }> {
    // 1. Persist the message
    await this.contactModel.create(dto);

    // 2. Notify admin. This must succeed for the contact form to be considered delivered.
    const delivery = await this.mailService.sendContactNotification(dto);
    if (!delivery.success) {
      this.logger.error(`Failed to deliver contact notification for ${dto.email}. accepted=${delivery.accepted.join(',')} rejected=${delivery.rejected.join(',')}`);
      throw new ServiceUnavailableException('Email service is currently unavailable');
    }

    // 3. Auto-reply to sender (best-effort)
    void this.mailService.sendContactAutoReply(dto.name, dto.email);

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
