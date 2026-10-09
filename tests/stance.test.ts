import { describe, expect, test } from 'bun:test';
import type { DimensionPolicy, Policy } from '../src/lib/schema';
import { areaStance, deriveStance, moodSample, type Stance } from '../src/lib/stance';

const none: DimensionPolicy = { verdict: 'unspecified', conditions: [] };
const allowed: DimensionPolicy = { verdict: 'allowed', conditions: [] };
const banned: DimensionPolicy = { verdict: 'banned', conditions: [] };
const policy = (p: Partial<Policy>): Policy => ({ contributions: none, issues: none, summaries: none, ...p });

describe('areaStance', () => {
  test('not addressed is unknown', () => {
    expect(areaStance(none)).toBe('unknown');
  });
  test('allowed is friendly', () => {
    expect(areaStance(allowed)).toBe('friendly');
  });
  test('baseline conditions stay friendly', () => {
    expect(areaStance({ verdict: 'conditional', conditions: ['human-accountable', 'human-reviewed', 'license-compliance'] })).toBe('friendly');
  });
  test('disclosure makes it mostly friendly', () => {
    expect(areaStance({ verdict: 'conditional', conditions: ['disclosure', 'human-accountable'] })).toBe('mostly-friendly');
  });
  test('minor help only is unfriendly', () => {
    expect(areaStance({ verdict: 'conditional', conditions: ['minor-assist-only'] })).toBe('unfriendly');
  });
  test('banned is unfriendly', () => {
    expect(areaStance(banned)).toBe('unfriendly');
  });
});

describe('deriveStance', () => {
  test('banned code is unfriendly regardless of the rest', () => {
    expect(deriveStance(policy({ contributions: banned, issues: allowed }))).toBe('unfriendly');
  });
  test('minor help only for code is unfriendly', () => {
    expect(deriveStance(policy({ contributions: { verdict: 'conditional', conditions: ['minor-assist-only'] } }))).toBe('unfriendly');
  });
  test('no policy at all is unknown', () => {
    expect(deriveStance(policy({}))).toBe('unknown');
  });
  test('code not addressed is unknown, whatever the other areas say', () => {
    expect(deriveStance(policy({ issues: { verdict: 'conditional', conditions: ['disclosure'] } }))).toBe('unknown');
    expect(deriveStance(policy({ summaries: banned }))).toBe('unknown');
  });
  test('allowed code is friendly', () => {
    expect(deriveStance(policy({ contributions: allowed }))).toBe('friendly');
  });
  test('disclosure for code is mostly friendly', () => {
    expect(deriveStance(policy({ contributions: { verdict: 'conditional', conditions: ['disclosure'] } }))).toBe('mostly-friendly');
  });
  test('allowed code but banned issues is mostly friendly', () => {
    expect(deriveStance(policy({ contributions: allowed, issues: banned }))).toBe('mostly-friendly');
  });
  test('allowed code but minor help only for text is mostly friendly', () => {
    expect(deriveStance(policy({ contributions: allowed, summaries: { verdict: 'conditional', conditions: ['minor-assist-only'] } }))).toBe(
      'mostly-friendly',
    );
  });
  test('conditions on issues alone do not lower friendly code', () => {
    expect(deriveStance(policy({ contributions: allowed, issues: { verdict: 'conditional', conditions: ['disclosure'] } }))).toBe('friendly');
  });
});

describe('moodSample', () => {
  const items = (counts: Partial<Record<Stance, number>>) =>
    Object.entries(counts).flatMap(([stance, n]) => Array.from({ length: n }, (_, id) => ({ stance: stance as Stance, id })));
  const tally = (list: { stance: Stance }[]) =>
    list.reduce<Partial<Record<Stance, number>>>((t, p) => ({ ...t, [p.stance]: (t[p.stance] ?? 0) + 1 }), {});

  test('under the cap keeps every item, grouped by stance', () => {
    const list = items({ unknown: 1, friendly: 2 });
    expect(moodSample(list, 48).map((p) => p.stance)).toEqual(['friendly', 'friendly', 'unknown']);
  });
  test('over the cap keeps proportions and exact size', () => {
    const sample = moodSample(items({ friendly: 500, 'mostly-friendly': 250, unfriendly: 150, unknown: 100 }), 48);
    expect(sample).toHaveLength(48);
    expect(tally(sample)).toEqual({ friendly: 24, 'mostly-friendly': 12, unfriendly: 7, unknown: 5 });
  });
  test('a tiny stance still gets one tile', () => {
    const sample = moodSample(items({ friendly: 990, unknown: 10 }), 48);
    expect(sample).toHaveLength(48);
    expect(tally(sample)).toEqual({ friendly: 47, unknown: 1 });
  });
  test('several tiny stances never push the sample over the cap', () => {
    const sample = moodSample(items({ friendly: 996, 'mostly-friendly': 2, unfriendly: 1, unknown: 1 }), 48);
    expect(sample).toHaveLength(48);
    expect(tally(sample)).toEqual({ friendly: 45, 'mostly-friendly': 1, unfriendly: 1, unknown: 1 });
  });
  test('keeps list order within a stance', () => {
    expect(moodSample(items({ friendly: 100 }), 3).map((p) => p.id)).toEqual([0, 1, 2]);
  });
});
