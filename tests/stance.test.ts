import { describe, expect, test } from 'bun:test';
import type { DimensionPolicy, Policy } from '../src/lib/schema';
import { areaStance, deriveStance } from '../src/lib/stance';

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
