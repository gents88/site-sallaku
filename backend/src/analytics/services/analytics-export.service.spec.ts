import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AnalyticsExportService } from './analytics-export.service';
import { PageView } from '../schemas/page-view.schema';
import { AnalyticsStats } from '../schemas/analytics-stats.schema';
import { MonthlyHistory } from '../schemas/monthly-history.schema';
import { CacheService } from '../../common/services/cache.service';

describe('AnalyticsExportService', () => {
  let service: AnalyticsExportService;
  let mockPageViewModel: any;
  let mockAnalyticsStatsModel: any;
  let mockMonthlyHistoryModel: any;
  let mockCache: any;

  beforeEach(async () => {
    mockPageViewModel = { find: jest.fn() };
    mockAnalyticsStatsModel = { findOne: jest.fn(), findOneAndUpdate: jest.fn().mockResolvedValue({}) };
    mockMonthlyHistoryModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
      find: jest.fn(),
    };
    mockCache = {
      getOrSet: jest.fn((_key: string, factory: () => unknown) => factory()),
      invalidatePrefix: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsExportService,
        { provide: getModelToken(PageView.name), useValue: mockPageViewModel },
        { provide: getModelToken(AnalyticsStats.name), useValue: mockAnalyticsStatsModel },
        { provide: getModelToken(MonthlyHistory.name), useValue: mockMonthlyHistoryModel },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get<AnalyticsExportService>(AnalyticsExportService);
  });

  describe('resetMonthlyStats', () => {
    it('skips the reset when already reset this calendar month and not forced', async () => {
      const now = new Date();
      mockAnalyticsStatsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ lastResetAt: now, monthlyViews: 5 }),
      });

      const result = await service.resetMonthlyStats(false);

      expect(result.success).toBe(true);
      expect(result.message).toMatch(/already reset/i);
      expect(mockMonthlyHistoryModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockAnalyticsStatsModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('saves a history snapshot and resets the monthly fields when forced', async () => {
      const now = new Date();
      mockAnalyticsStatsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ lastResetAt: now, monthlyViews: 42 }),
      });

      const result = await service.resetMonthlyStats(true);

      expect(result.success).toBe(true);
      expect(mockMonthlyHistoryModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ month: expect.any(String) }),
        expect.objectContaining({ $set: expect.objectContaining({ views: 42 }) }),
        { upsert: true },
      );
      expect(mockAnalyticsStatsModel.findOneAndUpdate).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ $set: expect.objectContaining({ monthlyViews: 0 }) }),
        { upsert: true },
      );
      expect(mockCache.invalidatePrefix).toHaveBeenCalledWith('analytics:');
    });

    it('proceeds when no stats document exists yet, even without force', async () => {
      mockAnalyticsStatsModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      const result = await service.resetMonthlyStats(false);

      expect(result.success).toBe(true);
      expect(mockAnalyticsStatsModel.findOneAndUpdate).toHaveBeenCalled();
    });
  });

  describe('getMonthlyHistory', () => {
    it('returns the last N months in chronological order', async () => {
      mockMonthlyHistoryModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([
                { month: '2026-03', views: 30 },
                { month: '2026-02', views: 20 },
              ]),
            }),
          }),
        }),
      });

      const result = await service.getMonthlyHistory(2);

      expect(result).toEqual([
        { month: '2026-02', views: 20 },
        { month: '2026-03', views: 30 },
      ]);
    });
  });
});
