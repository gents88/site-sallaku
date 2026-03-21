import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { ContactService } from '../contact/contact.service';
import { BlogService } from '../blog/blog.service';
import { AnalyticsService } from '../analytics/analytics.service';

interface StatsContactPoint {
  date: string;
  count: number;
}

interface StatsContentSummary {
  total: number;
  published: number;
  drafts: number;
}

interface AdminDashboardStatsResponse {
  users: number;
  contacts: number;
  recentContacts: Awaited<ReturnType<ContactService['findAll']>>;
  contactsByDay: StatsContactPoint[];
  content: StatsContentSummary;
  visits: {
    totalViews: number;
    uniqueVisitors: number;
    viewsByDay: StatsContactPoint[];
  };
}

@ApiTags('Stats')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(
    private users: UsersService,
    private contacts: ContactService,
    private blog: BlogService,
    private analytics: AnalyticsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get aggregate admin dashboard stats' })
  async getStats(): Promise<AdminDashboardStatsResponse> {
    const [userCount, contactCount, recentContacts, contactsByDay, content, visits] = await Promise.all([
      this.users.count(),
      this.contacts.count(),
      this.contacts.findAll(5),
      this.contacts.countByDay(7),
      this.blog.getContentSummary(),
      this.analytics.getVisitSummary(7),
    ]);

    return {
      users: userCount,
      contacts: contactCount,
      recentContacts,
      contactsByDay,
      content,
      visits,
    };
  }
}
