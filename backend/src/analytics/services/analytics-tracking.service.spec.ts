import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AnalyticsTrackingService } from './analytics-tracking.service';
import { PageView } from '../schemas/page-view.schema';
import { AnalyticsStats } from '../schemas/analytics-stats.schema';
import { ClickEvent } from '../schemas/click-event.schema';
import { CacheService } from '../../common/services/cache.service';

describe('AnalyticsTrackingService', () => {
  let service: AnalyticsTrackingService;
  let mockPageViewModel: any;
  let mockAnalyticsStatsModel: any;
  let mockClickEventModel: any;
  let mockCache: any;

  beforeEach(async () => {
    mockPageViewModel = {
      create: jest.fn().mockResolvedValue({}),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    mockAnalyticsStatsModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
    };
    mockClickEventModel = {
      create: jest.fn().mockResolvedValue({}),
    };
    mockCache = {
      invalidatePrefix: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsTrackingService,
        { provide: getModelToken(PageView.name), useValue: mockPageViewModel },
        { provide: getModelToken(AnalyticsStats.name), useValue: mockAnalyticsStatsModel },
        { provide: getModelToken(ClickEvent.name), useValue: mockClickEventModel },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get<AnalyticsTrackingService>(AnalyticsTrackingService);
  });

  describe('trackPageView', () => {
    it('persists the view, bumps the stats singleton and busts the analytics cache', async () => {
      const result = await service.trackPageView({ path: '/blog/my-post', visitorId: 'v1' } as any);

      expect(result).toEqual({ success: true });
      expect(mockPageViewModel.create).toHaveBeenCalledTimes(1);
      expect(mockAnalyticsStatsModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(mockCache.invalidatePrefix).toHaveBeenCalledWith('analytics:');
    });

    it('strips the query string from the tracked path', async () => {
      await service.trackPageView({ path: '/blog/post?utm_source=x', visitorId: 'v1' } as any);

      const created = mockPageViewModel.create.mock.calls[0][0];
      expect(created.path).toBe('/blog/post');
    });
  });

  describe('trackPageLeave', () => {
    it('is a no-op when no viewId is provided', async () => {
      const result = await service.trackPageLeave({} as any);

      expect(result).toEqual({ success: true });
      expect(mockPageViewModel.updateOne).not.toHaveBeenCalled();
    });

    it('updates dwell time for the matching view', async () => {
      await service.trackPageLeave({ viewId: 'abc', durationMs: 4200 } as any);

      expect(mockPageViewModel.updateOne).toHaveBeenCalledWith(
        { viewId: 'abc' },
        { $max: { durationMs: 4200 } },
      );
    });
  });

  describe('trackClickEvent', () => {
    it('persists the click and busts the click-stats cache', async () => {
      const result = await service.trackClickEvent({
        visitorId: 'v1',
        eventType: 'cta',
        label: 'hero-cta',
        path: '/',
      } as any);

      expect(result).toEqual({ success: true });
      expect(mockClickEventModel.create).toHaveBeenCalledTimes(1);
      expect(mockCache.invalidatePrefix).toHaveBeenCalledWith('analytics:clicks:');
    });
  });
});
