import { isProductionEnv } from './runtime-env';

describe('isProductionEnv', () => {
  it.each(['production', 'prod', 'PROD', ' Production '])('treats %p as production', (value) => {
    expect(isProductionEnv(value)).toBe(true);
  });

  it.each([undefined, '', 'dev', 'development', 'uat', 'staging', 'test', 'productionish'])('treats %p as non-production', (value) => {
    expect(isProductionEnv(value)).toBe(false);
  });

  it('reads process.env.NODE_ENV by default', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'prod';
    try {
      expect(isProductionEnv()).toBe(true);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});
