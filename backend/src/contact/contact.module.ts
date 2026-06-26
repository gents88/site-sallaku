import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { ContactMessage, ContactMessageSchema } from './schemas/contact-message.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ContactMessage.name, schema: ContactMessageSchema }]),
  ],
  controllers: [ContactController],
  providers: [ContactService],
  exports: [ContactService],
})
export class ContactModule {}
