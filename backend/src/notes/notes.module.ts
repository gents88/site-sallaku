import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Note, NoteSchema } from './schemas/note.schema';
import { Post, PostSchema } from '../blog/schemas/post.schema';
import { NotesController } from './notes.controller';
import { NotesService } from './services/notes.service';
import { SpamDetectionService } from './services/spam-detection.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Note.name, schema: NoteSchema },
      { name: Post.name, schema: PostSchema },
    ]),
  ],
  controllers: [NotesController],
  providers: [NotesService, SpamDetectionService],
  exports: [NotesService],
})
export class NotesModule {}
