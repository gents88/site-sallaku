import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Consent, ConsentDocument } from './consent.schema';
import { CreateConsentDto } from './dto/create-consent.dto';

@Injectable()
export class ConsentService {
  constructor(@InjectModel(Consent.name) private consentModel: Model<ConsentDocument>) {}

  async create(createDto: CreateConsentDto) {
    const doc = new this.consentModel({
      userId: createDto.userId,
      country: createDto.country,
      analytics: !!createDto.analytics,
      marketing: !!createDto.marketing,
      preferences: !!createDto.preferences,
      timestamp: new Date(),
    });
    return doc.save();
  }

  async stats() {
    const total = await this.consentModel.countDocuments();
    const analytics = await this.consentModel.countDocuments({ analytics: true });
    const marketing = await this.consentModel.countDocuments({ marketing: true });
    const preferences = await this.consentModel.countDocuments({ preferences: true });

    return {
      total,
      analytics,
      marketing,
      preferences,
      analyticsRate: total ? analytics / total : 0,
      marketingRate: total ? marketing / total : 0,
      preferencesRate: total ? preferences / total : 0,
    };
  }

  async history(limit = 100, skip = 0) {
    return this.consentModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
  }
}
