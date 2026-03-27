import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
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
  unreadContacts: number;
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
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
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
    const [userCount, contactCount, unreadContactCount, recentContacts, contactsByDay, content, visits] = await Promise.all([
      this.users.count(),
      this.contacts.count(),
      this.contacts.countUnread(),
      this.contacts.findAll(10),
      this.contacts.countByDay(7),
      this.blog.getContentSummary(),
      this.analytics.getVisitSummary(7),
    ]);

    return {
      users: userCount,
      contacts: contactCount,
      unreadContacts: unreadContactCount,
      recentContacts,
      contactsByDay,
      content,
      visits,
    };
  }
}
