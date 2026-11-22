import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ChatbotService } from './chatbot.service';
import { SendMessageDto, SendTranscriptDto } from './dto/chat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { RequireFeature } from '../common/settings/require-feature.decorator';

@ApiTags('Chatbot')
@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('message')
  @HttpCode(HttpStatus.OK)
  @RequireFeature('chatbotEnabled')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a chat message and receive an AI response' })
  sendMessage(@Req() req: any, @Body() dto: SendMessageDto) {
    const ip: string = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';
    const userAgent: string = req.headers?.['user-agent'] ?? '';
    return this.chatbotService.sendMessage(dto.message, dto.sessionId, { ip, userAgent }, dto.lang);
  }

  /**
   * Come /message, ma la risposta arriva a pezzi (Server-Sent Events): "delta" con il testo man mano che il
   * modello lo scrive, poi "done" con il risultato finale (testo pulito, suggerimenti, offerta live) oppure
   * "error". Il client ripiega su /message se lo stream non parte.
   */
  @Post('message/stream')
  @HttpCode(HttpStatus.OK)
  @RequireFeature('chatbotEnabled')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a chat message and stream the AI response (SSE)' })
  async sendMessageStream(@Req() req: any, @Res() res: any, @Body() dto: SendMessageDto) {
    const ip: string = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';
    const userAgent: string = req.headers?.['user-agent'] ?? '';

    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Dietro un proxy (Nginx/Apache) il buffer annullerebbe lo streaming.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // res (non req): in Node recente 'close' su req scatta a richiesta letta, non alla disconnessione.
    let closed = false;
    res.on('close', () => { closed = true; });
    const send = (event: string, data: unknown) => {
      if (closed || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      // compression() tiene i dati in buffer: senza flush il testo arriverebbe tutto insieme alla fine.
      res.flush?.();
    };

    try {
      const result = await this.chatbotService.sendMessageStream(
        dto.message, dto.sessionId, { ip, userAgent }, dto.lang, (text) => send('delta', { t: text }),
      );
      send('done', result);
    } catch (err) {
      send('error', { message: err instanceof Error ? err.message : 'error' });
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  @Get('session/:sessionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Retrieve conversation history for a session (admin only)' })
  getSession(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.chatbotService.getSession(sessionId);
  }

  @Post('send-transcript')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send the chat transcript via email' })
  sendTranscript(@Req() req: any, @Body() dto: SendTranscriptDto) {
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
  @ApiOperation({ summary: 'List all chatbot sessions active today (admin only), paginated' })
  @ApiQuery({ name: 'page',  required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getTodaySessions(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(15), ParseIntPipe) limit: number,
  ) {
    return this.chatbotService.getTodaySessions(page, Math.min(limit, 50));
  }
}
