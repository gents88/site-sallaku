import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TrackPageViewDto } from './dto/track-page-view.dto';
import { PageView, PageViewDocument } from './schemas/page-view.schema';

interface ViewsByDayPoint {
  date: string;
  count: number;
}

interface VisitSummary {
  totalViews: number;
  uniqueVisitors: number;
  viewsByDay: ViewsByDayPoint[];
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(PageView.name)
    private pageViewModel: Model<PageViewDocument>,
  ) {}

  async trackPageView(dto: TrackPageViewDto): Promise<{ success: boolean }> {
    await this.pageViewModel.create({
      visitorId: dto.visitorId,
      path: dto.path,
      referrer: dto.referrer ?? '',
      language: dto.language ?? '',
      userAgent: dto.userAgent ?? '',
    });

    return { success: true };
  }

  async getVisitSummary(days = 7): Promise<VisitSummary> {
    const [totalViews, uniqueVisitors, viewsByDay] = await Promise.all([
      this.pageViewModel.countDocuments().exec(),
      this.pageViewModel.distinct('visitorId').then(ids => ids.length),
      this.countViewsByDay(days),
    ]);

    return {
      totalViews,
      uniqueVisitors,
      viewsByDay,
    };
  }

  private async countViewsByDay(days: number): Promise<ViewsByDayPoint[]> {
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const results = await this.pageViewModel.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          createdAt: {
            $gte: start,
            $lte: end,
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec();

    const counts = new Map(results.map(item => [item._id, item.count]));

    return Array.from({ length: days }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = date.toISOString().slice(0, 10);

      return {
        date: key,
        count: counts.get(key) ?? 0,
      };
    });
  }
}