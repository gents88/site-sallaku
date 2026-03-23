import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Req,
  HttpException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChatbotService } from './chatbot.service';
import { SendMessageDto, SendTranscriptDto } from './dto/chat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Chatbot')
@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  /** In-memory rate limiter: max 30 messages per minute per IP */
  private readonly rateMap = new Map<string, number[]>();

  private checkRateLimit(req: any, limit = 30, windowMs = 60_000): void {
    const ip: string =
      req.ip ||
      req.headers['x-forwarded-for'] ||
      req.connection?.remoteAddress ||
      'unknown';

    const now = Date.now();
    const cutoff = now - windowMs;
    const times = (this.rateMap.get(ip) ?? []).filter((t) => t >= cutoff);

    if (times.length >= limit) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    times.push(now);
    this.rateMap.set(ip, times);

    // Periodic cleanup to avoid unbounded memory growth
    if (Math.random() < 0.05) {
      for (const [key, ts] of this.rateMap.entries()) {
        const cleaned = ts.filter((t) => t >= cutoff);
        if (cleaned.length === 0) this.rateMap.delete(key);
        else this.rateMap.set(key, cleaned);
      }
    }
  }

  @Post('message')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a chat message and receive an AI response' })
  sendMessage(@Req() req: any, @Body() dto: SendMessageDto) {
    this.checkRateLimit(req);
    const ip: string = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';
    const userAgent: string = req.headers?.['user-agent'] ?? '';
    return this.chatbotService.sendMessage(dto.message, dto.sessionId, { ip, userAgent });
  }

  @Get('session/:sessionId')
  @ApiOperation({ summary: 'Retrieve conversation history for a session' })
  getSession(@Param('sessionId') sessionId: string) {
    return this.chatbotService.getSession(sessionId);
  }

  @Post('send-transcript')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send the chat transcript via email' })
  sendTranscript(@Req() req: any, @Body() dto: SendTranscriptDto) {
    this.checkRateLimit(req, 5, 60_000); // stricter limit for email sending
    return this.chatbotService.sendTranscript(dto.sessionId, dto.email);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get chatbot statistics (admin only)' })
  getChatbotStats() {
    return this.chatbotService.getChatbotStats();
  }

  @Get('sessions/today')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all chatbot sessions active today (admin only)' })
  getTodaySessions() {
    return this.chatbotService.getTodaySessions();
  }
}
