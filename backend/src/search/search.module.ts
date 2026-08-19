import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { MongoSearchProvider } from './providers/mongo-search.provider';
import { SEARCH_PROVIDER } from './interfaces/search.interface';
import { Post, PostSchema } from '../blog/schemas/post.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService, { provide: SEARCH_PROVIDER, useClass: MongoSearchProvider }],
})
export class SearchModule {}
