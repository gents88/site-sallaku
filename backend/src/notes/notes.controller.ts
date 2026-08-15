import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { NotesService, NoteModerationStatus } from './services/notes.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { NoteResponseDto } from './dto/note-response.dto';
import { NoteAdminListItemDto } from './dto/note-admin-list-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, Role } from '../auth/decorators/roles.decorator';
import { CacheControlInterceptor } from '../common/interceptors/cache-control.interceptor';

@ApiTags('Notes')
@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  // ── Admin: site-wide moderation list ────────────────────────────────
  @Get('admin/list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List notes across all articles for moderation (admin only)' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'approved', 'spam', 'all'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  async getAllForAdmin(
    @Query('status') status?: NoteModerationStatus,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ): Promise<{ data: NoteAdminListItemDto[]; total: number }> {
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const skipNum = Math.max(parseInt(skip) || 0, 0);
    return this.notesService.getAllForAdmin(status ?? 'pending', limitNum, skipNum);
  }

  @Post(':articleId')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a new note for an article' })
  @ApiResponse({ status: 201, description: 'Note created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or spam detected' })
  async createNote(
    @Param('articleId') articleId: string,
    @Body() dto: CreateNoteDto,
    @Req() req: any,
  ): Promise<NoteResponseDto> {
    const userIp = req.ip || req.connection.remoteAddress;
    return this.notesService.createNote(articleId, dto, userIp);
  }

  @Get(':articleId')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @UseInterceptors(new CacheControlInterceptor(60, 30))
  @ApiOperation({ summary: 'Get approved notes for an article' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Notes retrieved successfully' })
  async getNotes(
    @Param('articleId') articleId: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ): Promise<{ data: NoteResponseDto[]; total: number }> {
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const skipNum = Math.max(parseInt(skip) || 0, 0);

    return this.notesService.getNotes(articleId, true, limitNum, skipNum);
  }

  @Get(':articleId/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get notes statistics for an article (admin only)' })
  async getNotesStats(@Param('articleId') articleId: string) {
    return this.notesService.getArticleNotesStats(articleId);
  }

  @Get('/:noteId/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get single note details (admin only)' })
  async getNoteById(@Param('noteId') noteId: string): Promise<NoteResponseDto> {
    return this.notesService.getNoteById(noteId);
  }

  @Patch('/:noteId/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve a pending note (admin only)' })
  async approveNote(@Param('noteId') noteId: string): Promise<NoteResponseDto> {
    return this.notesService.updateNoteApprovalStatus(noteId, true);
  }

  @Patch('/:noteId/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject a note (admin only)' })
  async rejectNote(@Param('noteId') noteId: string): Promise<NoteResponseDto> {
    return this.notesService.updateNoteApprovalStatus(noteId, false);
  }

  @Patch('/:noteId/spam')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark a note as spam (admin only)' })
  async markAsSpam(@Param('noteId') noteId: string): Promise<NoteResponseDto> {
    return this.notesService.markAsSpam(noteId);
  }

  @Delete('/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a note (admin only)' })
  async deleteNote(@Param('noteId') noteId: string): Promise<void> {
    return this.notesService.deleteNote(noteId);
  }
}
