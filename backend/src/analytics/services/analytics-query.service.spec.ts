import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AnalyticsQueryService } from './analytics-query.service';
import { PageView } from '../schemas/page-view.schema';
import { AnalyticsStats } from '../schemas/analytics-stats.schema';
import { ClickEvent } from '../schemas/click-event.schema';
import { CacheService } from '../../common/services/cache.service';

describe('AnalyticsQueryService', () => {
  let service: AnalyticsQueryService;
  let mockPageViewModel: any;
  let mockAnalyticsStatsModel: any;
  let mockClickEventModel: any;
  let mockCache: any;

  beforeEach(async () => {
    mockPageViewModel = {
      aggregate: jest.fn(),
      countDocuments: jest.fn(),
      distinct: jest.fn(),
    };
    mockAnalyticsStatsModel = {
      findOne: jest.fn(),
    };
    mockClickEventModel = {
      aggregate: jest.fn(),
      countDocuments: jest.fn(),
      distinct: jest.fn(),
    };
    // Bypass caching entirely so tests exercise the underlying aggregation logic.
    mockCache = {
      getOrSet: jest.fn((_key: string, factory: () => unknown) => factory()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsQueryService,
        { provide: getModelToken(PageView.name), useValue: mockPageViewModel },
        { provide: getModelToken(AnalyticsStats.name), useValue: mockAnalyticsStatsModel },
        { provide: getModelToken(ClickEvent.name), useValue: mockClickEventModel },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get<AnalyticsQueryService>(AnalyticsQueryService);
  });

  describe('getTopPages', () => {
    it('maps aggregation rows to BreakdownItem[]', async () => {
      mockPageViewModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: '/blog', count: 12 },
          { _id: '/', count: 8 },
        ]),
      });

      const result = await service.getTopPages(10);

      expect(result).toEqual([
        { label: '/blog', count: 12 },
        { label: '/', count: 8 },
      ]);
    });
  });

  describe('getAnalyticsStats', () => {
    it('returns zeroed defaults when no stats document exists yet', async () => {
      mockAnalyticsStatsModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      });

      const result = await service.getAnalyticsStats();

      expect(result.totalViews).toBe(0);
      expect(result.locations).toEqual([]);
      expect(result.lastResetAt).toBeNull();
    });

    it('sorts the locations/devices records by count, capped at 15', async () => {
      mockAnalyticsStatsModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            totalViews: 100,
            monthlyViews: 10,
            locations: { Italy: 5, Germany: 20, France: 12 },
            monthlyLocations: {},
            devices: {},
            monthlyDevices: {},
            lastResetAt: null,
          }),
        }),
      });

      const result = await service.getAnalyticsStats();

      expect(result.locations).toEqual([
        { label: 'Germany', count: 20 },
        { label: 'France', count: 12 },
        { label: 'Italy', count: 5 },
      ]);
    });
  });

  describe('getClickStats', () => {
    it('aggregates labels, event types, destinations and the total count', async () => {
      mockClickEventModel.aggregate
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([{ _id: 'hero-cta', count: 3 }]) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([{ _id: 'click', count: 3 }]) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([]) });
      mockClickEventModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(3) });

      const result = await service.getClickStats(20);

      expect(result.topLabels).toEqual([{ label: 'hero-cta', count: 3 }]);
      expect(result.totalClicks).toBe(3);
    });

    it('scopes every stage to eventType when the filter is provided', async () => {
      mockClickEventModel.aggregate
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([{ _id: 'sidebar_rail_expand', count: 7 }]) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([{ _id: 'sidebar', count: 7 }]) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([]) });
      mockClickEventModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(7) });

      const result = await service.getClickStats(20, 'sidebar');

      expect(result.topLabels).toEqual([{ label: 'sidebar_rail_expand', count: 7 }]);
      expect(mockClickEventModel.countDocuments).toHaveBeenCalledWith({ eventType: 'sidebar' });
      // Ogni pipeline deve partire dallo stesso $match, incluso il ramo destinations
      // che aggiunge una sua condizione.
      for (const [pipeline] of mockClickEventModel.aggregate.mock.calls) {
        expect(pipeline[0].$match).toMatchObject({ eventType: 'sidebar' });
      }
    });
  });

  describe('getToolConversionFunnel', () => {
    it('counts, per tool, how many of its unique visitors also appear as a lead', async () => {
      mockClickEventModel.distinct.mockReturnValue({
        exec: jest.fn().mockResolvedValue(['visitor-a', 'visitor-c']),
      });
      mockClickEventModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: 'pdf_translate', visitorIds: ['visitor-a', 'visitor-b'] },
          { _id: 'ocr', visitorIds: ['visitor-x'] },
        ]),
      });

      const result = await service.getToolConversionFunnel(30);

      expect(result).toEqual([
        { tool: 'pdf_translate', uniqueVisitors: 2, becameLead: 1, conversionRate: 50 },
        { tool: 'ocr', uniqueVisitors: 1, becameLead: 0, conversionRate: 0 },
      ]);
      expect(mockClickEventModel.distinct).toHaveBeenCalledWith(
        'visitorId',
        expect.objectContaining({ eventType: 'lead' }),
      );
    });

    it('sorts tools by unique visitors, descending', async () => {
      mockClickEventModel.distinct.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });
      mockClickEventModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: 'ocr', visitorIds: ['v1'] },
          { _id: 'pdf_translate', visitorIds: ['v1', 'v2', 'v3'] },
        ]),
      });

      const result = await service.getToolConversionFunnel(30);

      expect(result.map((r) => r.tool)).toEqual(['pdf_translate', 'ocr']);
    });

    it('returns an empty array when no tool has been used in the window', async () => {
      mockClickEventModel.distinct.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });
      mockClickEventModel.aggregate.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });

      const result = await service.getToolConversionFunnel(30);

      expect(result).toEqual([]);
    });
  });
});
