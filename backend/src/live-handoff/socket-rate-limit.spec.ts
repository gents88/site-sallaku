import { SocketRateLimiter } from './socket-rate-limit';

describe('SocketRateLimiter', () => {
  let t: number;
  const clock = () => t;

  beforeEach(() => {
    t = 1_000_000;
  });

  it('consente fino al limite e poi rifiuta', () => {
    const rl = new SocketRateLimiter(3, 10_000, clock);
    expect([rl.allow('a'), rl.allow('a'), rl.allow('a'), rl.allow('a')]).toEqual([true, true, true, false]);
  });

  it('riapre quando gli eventi escono dalla finestra', () => {
    const rl = new SocketRateLimiter(2, 10_000, clock);
    rl.allow('a');
    rl.allow('a');
    expect(rl.allow('a')).toBe(false);
    t += 10_001;
    expect(rl.allow('a')).toBe(true);
  });

  it('un evento rifiutato non prolunga il blocco', () => {
    const rl = new SocketRateLimiter(1, 10_000, clock);
    rl.allow('a');
    t += 5_000;
    expect(rl.allow('a')).toBe(false);
    t += 5_001; // il primo evento ha ormai 10 s; il rifiutato non conta
    expect(rl.allow('a')).toBe(true);
  });

  it('i socket sono indipendenti', () => {
    const rl = new SocketRateLimiter(1, 10_000, clock);
    expect(rl.allow('a')).toBe(true);
    expect(rl.allow('b')).toBe(true);
    expect(rl.allow('a')).toBe(false);
  });

  it('forget azzera lo stato del socket', () => {
    const rl = new SocketRateLimiter(1, 10_000, clock);
    rl.allow('a');
    rl.forget('a');
    expect(rl.allow('a')).toBe(true);
  });
});
