import { Controller, Post, Body, HttpCode, HttpStatus, Patch, Param, UseGuards, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { ContactDto } from './dto/contact.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a contact message (public)' })
  sendMessage(@Body() dto: ContactDto) {
    return this.contactService.sendMessage(dto);
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Mark contact message as read (admin)' })
  markAsRead(@Param('id') id: string, @Body() body?: { read?: boolean }) {
    return this.contactService.markAsRead(id, body?.read ?? true);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete contact message (admin)' })
  deleteMessage(@Param('id') id: string) {
    return this.contactService.deleteMessage(id);
  }
}
