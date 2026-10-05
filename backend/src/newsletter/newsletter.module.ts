import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NewsletterSubscriber, NewsletterSubscriberSchema } from './schemas/newsletter-subscriber.schema';
import { NewsletterController } from './newsletter.controller';
import { NewsletterService } from './newsletter.service';
import { AuditModule } from '../audit/audit.module';
import { NewsletterCampaignsController } from './campaigns/newsletter-campaigns.controller';
import { NewsletterCampaignsService } from './campaigns/newsletter-campaigns.service';
import {
  NewsletterCampaign, NewsletterCampaignSchema, NewsletterDelivery, NewsletterDeliverySchema,
} from './campaigns/newsletter-campaign.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NewsletterSubscriber.name, schema: NewsletterSubscriberSchema },
      { name: NewsletterCampaign.name, schema: NewsletterCampaignSchema },
      { name: NewsletterDelivery.name, schema: NewsletterDeliverySchema },
    ]),
    AuditModule,
  ],
  controllers: [NewsletterController, NewsletterCampaignsController],
  providers: [NewsletterService, NewsletterCampaignsService],
})
export class NewsletterModule {}
