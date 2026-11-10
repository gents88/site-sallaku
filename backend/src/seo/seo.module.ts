import { Module } from '@nestjs/common';
import { BlogModule } from '../blog/blog.module';
import { ProjectsModule } from '../projects/projects.module';
import { PageShellService } from './page-shell.service';
import { SeoController } from './seo.controller';

@Module({
  imports: [BlogModule, ProjectsModule],
  controllers: [SeoController],
  providers: [PageShellService],
})
export class SeoModule {}
