import { describe, expect, it } from 'vitest';
import { BUILD_INFO } from './build-info';

describe('BUILD_INFO', () => {
  it('ha sempre un commit non vuoto, anche senza --define (ng serve, test)', () => {
    expect(typeof BUILD_INFO.commit).toBe('string');
    expect(BUILD_INFO.commit.length).toBeGreaterThan(0);
  });

  it('espone l\'ora di build come stringa (vuota fuori da ng-build.js)', () => {
    expect(typeof BUILD_INFO.time).toBe('string');
  });
});
