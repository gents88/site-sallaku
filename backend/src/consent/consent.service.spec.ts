import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConsentService } from './consent.service';
import { Consent } from './consent.schema';

describe('ConsentService', () => {
  let service: ConsentService;
  let mockConsentModel: any;

  beforeEach(async () => {
    mockConsentModel = jest.fn().mockImplementation((data) => ({
      ...data,
      save: jest.fn().mockResolvedValue({ ...data, _id: 'new-id' }),
    }));
    mockConsentModel.countDocuments = jest.fn();
    mockConsentModel.find = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsentService,
        { provide: getModelToken(Consent.name), useValue: mockConsentModel },
      ],
    }).compile();

    service = module.get<ConsentService>(ConsentService);
  });

  describe('create', () => {
    it('coerces the consent flags to booleans and persists the document', async () => {
      const result = await service.create({
        userId: 'u1',
        country: 'IT',
        analytics: 1,
        marketing: 0,
      } as any);

      expect(result).toHaveProperty('_id', 'new-id');
      const constructedArg = mockConsentModel.mock.calls[0][0];
      expect(constructedArg.analytics).toBe(true);
      expect(constructedArg.marketing).toBe(false);
      expect(constructedArg.preferences).toBe(false);
    });
  });

  describe('stats', () => {
    it('computes acceptance rates from the raw counts', async () => {
      mockConsentModel.countDocuments
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(60) // analytics
        .mockResolvedValueOnce(40) // marketing
        .mockResolvedValueOnce(20); // preferences

      const result = await service.stats();

      expect(result).toEqual({
        total: 100,
        analytics: 60,
        marketing: 40,
        preferences: 20,
        analyticsRate: 0.6,
        marketingRate: 0.4,
        preferencesRate: 0.2,
      });
    });

    it('returns zeroed rates when there are no consent records yet', async () => {
      mockConsentModel.countDocuments.mockResolvedValue(0);

      const result = await service.stats();

      expect(result.analyticsRate).toBe(0);
      expect(result.marketingRate).toBe(0);
      expect(result.preferencesRate).toBe(0);
    });
  });

  describe('history', () => {
    it('applies pagination and sorts by newest first', async () => {
      const lean = jest.fn().mockResolvedValue([{ userId: 'u1' }]);
      const limit = jest.fn().mockReturnValue({ lean });
      const skip = jest.fn().mockReturnValue({ limit });
      const sort = jest.fn().mockReturnValue({ skip });
      mockConsentModel.find.mockReturnValue({ sort });

      const result = await service.history(50, 10);

      expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(skip).toHaveBeenCalledWith(10);
      expect(limit).toHaveBeenCalledWith(50);
      expect(result).toEqual([{ userId: 'u1' }]);
    });
  });
});
