import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Note, NoteDocument } from '../schemas/note.schema';
import { CreateNoteDto } from '../dto/create-note.dto';
import { NoteResponseDto } from '../dto/note-response.dto';
import { SpamDetectionService } from './spam-detection.service';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class NotesService {
  constructor(
    @InjectModel(Note.name) private noteModel: Model<NoteDocument>,
    private spamDetectionService: SpamDetectionService,
  ) {}

  async createNote(
    articleId: string,
    dto: CreateNoteDto,
    userIp?: string,
  ): Promise<NoteResponseDto> {
    if (!Types.ObjectId.isValid(articleId)) {
      throw new BadRequestException('Article ID non valido');
    }

    const { isSpam, score } = this.spamDetectionService.detectSpam(dto, userIp);

    if (isSpam && score >= 80) {
      throw new BadRequestException('La nota è stata contrassegnata come spam');
    }

    const sanitizedContent = this.spamDetectionService.sanitizeContent(dto.content);

    const note = new this.noteModel({
      articleId: new Types.ObjectId(articleId),
      name: dto.name || null,
      email: dto.email || null,
      content: sanitizedContent,
      isSpam: isSpam && score >= 50,
      spamScore: score,
      userIp: userIp || null,
      isApproved: score < 30,
    });

    const savedNote = await note.save();
    return this.mapToResponseDto(savedNote);
  }

  async getNotes(
    articleId: string,
    onlyApproved: boolean = true,
    limit: number = 50,
    skip: number = 0,
  ): Promise<{ data: NoteResponseDto[]; total: number }> {
    if (!Types.ObjectId.isValid(articleId)) {
      throw new BadRequestException('Article ID non valido');
    }

    const query: any = {
      articleId: new Types.ObjectId(articleId),
      isSpam: false,
    };

    if (onlyApproved) {
      query.isApproved = true;
    }

    const [notes, total] = await Promise.all([
      this.noteModel
        .find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .exec(),
      this.noteModel.countDocuments(query),
    ]);

    return {
      data: notes.map((note) => this.mapToResponseDto(note)),
      total,
    };
  }

  async getNoteById(noteId: string): Promise<NoteResponseDto> {
    if (!Types.ObjectId.isValid(noteId)) {
      throw new BadRequestException('Note ID non valido');
    }

    const note = await this.noteModel.findById(noteId).exec();

    if (!note) {
      throw new NotFoundException('Nota non trovata');
    }

    return this.mapToResponseDto(note);
  }

  async updateNoteApprovalStatus(noteId: string, isApproved: boolean): Promise<NoteResponseDto> {
    if (!Types.ObjectId.isValid(noteId)) {
      throw new BadRequestException('Note ID non valido');
    }

    const note = await this.noteModel.findByIdAndUpdate(
      noteId,
      { isApproved, updatedAt: new Date() },
      { new: true },
    );

    if (!note) {
      throw new NotFoundException('Nota non trovata');
    }

    return this.mapToResponseDto(note);
  }

  async markAsSpam(noteId: string): Promise<NoteResponseDto> {
    if (!Types.ObjectId.isValid(noteId)) {
      throw new BadRequestException('Note ID non valido');
    }

    const note = await this.noteModel.findByIdAndUpdate(
      noteId,
      { isSpam: true, updatedAt: new Date() },
      { new: true },
    );

    if (!note) {
      throw new NotFoundException('Nota non trovata');
    }

    return this.mapToResponseDto(note);
  }

  async deleteNote(noteId: string): Promise<void> {
    if (!Types.ObjectId.isValid(noteId)) {
      throw new BadRequestException('Note ID non valido');
    }

    const result = await this.noteModel.findByIdAndDelete(noteId);

    if (!result) {
      throw new NotFoundException('Nota non trovata');
    }
  }

  async getArticleNotesStats(articleId: string): Promise<{
    total: number;
    approved: number;
    pending: number;
    spam: number;
  }> {
    if (!Types.ObjectId.isValid(articleId)) {
      throw new BadRequestException('Article ID non valido');
    }

    const baseQuery = { articleId: new Types.ObjectId(articleId) };

    const [total, approved, pending, spam] = await Promise.all([
      this.noteModel.countDocuments(baseQuery),
      this.noteModel.countDocuments({ ...baseQuery, isApproved: true, isSpam: false }),
      this.noteModel.countDocuments({ ...baseQuery, isApproved: false, isSpam: false }),
      this.noteModel.countDocuments({ ...baseQuery, isSpam: true }),
    ]);

    return { total, approved, pending, spam };
  }

  private mapToResponseDto(note: NoteDocument): NoteResponseDto {
    const dto = plainToInstance(NoteResponseDto, note.toObject());
    dto.id = note._id.toString();
    dto.articleId = note.articleId.toString();
    return dto;
  }
}
