import { describe, expect, it } from 'vitest';
import { DASHBOARD_POLL_MS, failedSectionLabels, shouldRefreshOnVisible, sparkline } from './dashboard-metrics';

describe('sparkline', () => {
  it('scales a real daily series to bar heights, peak = 100%', () => {
    expect(sparkline([{ count: 2 }, { count: 4 }, { count: 1 }])).toEqual([50, 100, 25]);
  });

  it('keeps tiny non-zero values visible (min 8%)', () => {
    expect(sparkline([{ count: 1 }, { count: 100 }])).toEqual([8, 100]);
  });

  it('draws flat minimum bars for an all-zero series', () => {
    expect(sparkline([{ count: 0 }, { count: 0 }])).toEqual([8, 8]);
  });

  it('returns null when there is no series to draw (no fake chart)', () => {
    expect(sparkline(null)).toBeNull();
    expect(sparkline([])).toBeNull();
    expect(sparkline([{ count: 5 }])).toBeNull();
  });
});

describe('shouldRefreshOnVisible', () => {
  const now = Date.now();

  it('never refreshes while the tab is hidden', () => {
    expect(shouldRefreshOnVisible(true, null, now)).toBe(false);
  });

  it('refreshes on return when the snapshot is older than the poll interval', () => {
    expect(shouldRefreshOnVisible(false, new Date(now - DASHBOARD_POLL_MS), now)).toBe(true);
  });

  it('does not refresh on return when the snapshot is still fresh', () => {
    expect(shouldRefreshOnVisible(false, new Date(now - 5_000), now)).toBe(false);
  });

  it('refreshes when nothing was ever loaded', () => {
    expect(shouldRefreshOnVisible(false, null, now)).toBe(true);
  });
});

describe('failedSectionLabels', () => {
  it('de-duplicates the three system sections into one panel label', () => {
    expect(failedSectionLabels(new Set(['systemHealth', 'systemOps', 'gsc'] as const))).toEqual(['admin.utility_section', 'admin.seo_title']);
  });
});
