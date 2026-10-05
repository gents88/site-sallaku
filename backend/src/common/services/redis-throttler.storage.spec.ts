import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  it('maps the atomic script result to the throttler record (seconds, rounded up)', async () => {
    const redis = { eval: jest.fn().mockResolvedValue([3, 41_200, 0, 0]) };
    const storage = new RedisThrottlerStorage(redis as never);
    const rec = await storage.increment('1.2.3.4', 60_000, 10, 60_000, 'default');
    expect(rec).toEqual({ totalHits: 3, timeToExpire: 42, isBlocked: false, timeToBlockExpire: 0 });
    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 2, 'throttle:default:1.2.3.4', 'throttle:default:1.2.3.4:block', 60_000, 10, 60_000);
  });

  it('reports a block with its remaining duration', async () => {
    const redis = { eval: jest.fn().mockResolvedValue([11, 30_000, 1, 59_500]) };
    const rec = await new RedisThrottlerStorage(redis as never).increment('k', 60_000, 10, 60_000, 'default');
    expect(rec.isBlocked).toBe(true);
    expect(rec.timeToBlockExpire).toBe(60);
  });

  it('falls back to in-memory counting when Redis is down, still enforcing the limit', async () => {
    const redis = { eval: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const storage = new RedisThrottlerStorage(redis as never);
    let last;
    for (let i = 0; i < 3; i++) last = await storage.increment('k', 60_000, 2, 60_000, 'default');
    expect(last!.totalHits).toBe(3);
    expect(last!.isBlocked).toBe(true);
  });
});
