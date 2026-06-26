import { Injectable } from '@nestjs/common';
import { GenerateBlogFromPdfDto } from '../dto/generate-blog-from-pdf.dto';
import { BlogAiService, GeneratedBlogDraft } from './blog-ai.service';
import { PdfExtractionService } from './pdf-extraction.service';

export interface BlogPdfGenerationResponse extends GeneratedBlogDraft {
  source: {
    fileName: string;
    pageCount: number;
    wordCount: number;
    sizeBytes: number;
    preview: string;
  };
}

@Injectable()
export class BlogGenerationService {
  constructor(
    private readonly pdfExtractionService: PdfExtractionService,
    private readonly blogAiService: BlogAiService,
  ) {}

  async generateFromPdf(
    file: Express.Multer.File,
    dto: GenerateBlogFromPdfDto,
  ): Promise<BlogPdfGenerationResponse> {
    const extracted = await this.pdfExtractionService.extract(file);
    const draft = await this.blogAiService.generateDraft(extracted, dto.language, dto.context);

    return {
      ...draft,
      source: {
        fileName: extracted.fileName,
        pageCount: extracted.pageCount,
        wordCount: extracted.wordCount,
        sizeBytes: extracted.sizeBytes,
        preview: extracted.preview,
      },
    };
  }
}