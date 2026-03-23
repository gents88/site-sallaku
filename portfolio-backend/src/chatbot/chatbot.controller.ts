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

@ApiTags('Chatbot')
@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('message')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a chat message and receive an AI response' })
  sendMessage(@Req() req: any, @Body() dto: SendMessageDto) {
    const ip: string = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';
    const userAgent: string = req.headers?.['user-agent'] ?? '';
    return this.chatbotService.sendMessage(dto.message, dto.sessionId, { ip, userAgent });
  }

  @Get('session/:sessionId')
  @ApiOperation({ summary: 'Retrieve conversation history for a session' })
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
