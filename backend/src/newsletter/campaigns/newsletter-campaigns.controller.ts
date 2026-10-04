import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Role, Roles } from '../../auth/decorators/roles.decorator';
import { AuditInterceptor } from '../../audit/interceptors/audit.interceptor';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import { NewsletterCampaignsService } from './newsletter-campaigns.service';
import { SendCampaignDto, TestCampaignDto, UpsertCampaignDto } from './campaign.dto';

@ApiTags('Newsletter campaigns')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
@UseInterceptors(AuditInterceptor)
@Controller('newsletter/admin/campaigns')
export class NewsletterCampaignsController {
  constructor(private readonly campaigns: NewsletterCampaignsService) {}

  @Get()
  @ApiOperation({ summary: 'List campaigns (admin)' })
  list() { return this.campaigns.list(); }

  @Get(':id')
  get(@Param('id', ParseMongoIdPipe) id: string) { return this.campaigns.get(id); }

  @Post()
  @ApiOperation({ summary: 'Create a draft campaign (admin)' })
  create(@Body() dto: UpsertCampaignDto) { return this.campaigns.create(dto); }

  @Put(':id')
  @ApiOperation({ summary: 'Update a draft campaign (admin)' })
  update(@Param('id', ParseMongoIdPipe) id: string, @Body() dto: UpsertCampaignDto) { return this.campaigns.update(id, dto); }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseMongoIdPipe) id: string) { return this.campaigns.remove(id); }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a test email of the campaign (admin)' })
  test(@Param('id', ParseMongoIdPipe) id: string, @Body() dto: TestCampaignDto) { return this.campaigns.sendTest(id, dto.email); }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Queue the campaign now or at scheduledAt (admin)' })
  send(@Param('id', ParseMongoIdPipe) id: string, @Body() dto: SendCampaignDto) { return this.campaigns.send(id, dto.scheduledAt); }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a scheduled/sending campaign (admin)' })
  cancel(@Param('id', ParseMongoIdPipe) id: string) { return this.campaigns.cancel(id); }
}
