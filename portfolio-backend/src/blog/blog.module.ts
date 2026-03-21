import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import { Post, PostSchema } from './schemas/post.schema';
import { PdfExtractionService } from './services/pdf-extraction.service';
import { BlogAiService } from './services/blog-ai.service';
import { BlogGenerationService } from './services/blog-generation.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }])],
  controllers: [BlogController],
  providers: [BlogService, PdfExtractionService, BlogAiService, BlogGenerationService],
  exports: [BlogService],
})
export class BlogModule {}
