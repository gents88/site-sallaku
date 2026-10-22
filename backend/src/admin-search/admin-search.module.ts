import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminSearchController } from './admin-search.controller';
import { AdminSearchService } from './admin-search.service';
import { ContactMessage, ContactMessageSchema } from '../contact/schemas/contact-message.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Post, PostSchema } from '../blog/schemas/post.schema';
import { Note, NoteSchema } from '../notes/schemas/note.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContactMessage.name, schema: ContactMessageSchema },
      { name: User.name, schema: UserSchema },
      { name: Post.name, schema: PostSchema },
      { name: Note.name, schema: NoteSchema },
    ]),
  ],
  controllers: [AdminSearchController],
  providers: [AdminSearchService],
})
export class AdminSearchModule {}
