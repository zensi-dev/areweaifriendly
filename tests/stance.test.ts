import { describe, expect, test } from 'bun:test';
import type { DimensionPolicy, Policy, Rule, RuleCondition, RuleStatus, Use } from '../src/lib/schema';
import { areaStance, deriveArea, derivePolicy, deriveStance, moodSample, type Stance } from '../src/lib/stance';

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
  test('limited scope makes it mostly friendly', () => {
    expect(areaStance({ verdict: 'conditional', conditions: ['limited-scope', 'human-accountable'] })).toBe('mostly-friendly');
  });
  test('a ban on autonomous agents is a baseline condition', () => {
    expect(areaStance({ verdict: 'conditional', conditions: ['human-accountable', 'no-autonomous-agents'] })).toBe('friendly');
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

const rule = (use: Use, status: RuleStatus, ...conditions: (RuleCondition['condition'] | `${RuleCondition['condition']}?`)[]): Rule => ({
  use,
  status,
  conditions: conditions.map((c) =>
    c.endsWith('?') ? { condition: c.slice(0, -1) as RuleCondition['condition'], strength: 'recommended' } : { condition: c as RuleCondition['condition'], strength: 'required' },
  ),
  note: use,
  quotes: [{ quote: use, sourceUrl: 'https://example.org/' }],
});

describe('derivePolicy', () => {
  test('no rules: every area unspecified', () => {
    expect(derivePolicy([])).toEqual({ contributions: none, issues: none, summaries: none });
  });
  test('permitted code takes the required conditions of the permitted code uses', () => {
    const rules = [rule('code-large', 'conditional', 'disclosure', 'human-accountable', 'license-compliance?'), rule('code-small', 'allowed')];
    expect(derivePolicy(rules).contributions).toEqual({ verdict: 'conditional', conditions: ['disclosure', 'human-accountable'] });
  });
  test('allowed with no AI-specific requirement is allowed', () => {
    expect(derivePolicy([rule('code-large', 'allowed', 'disclosure?')]).contributions).toEqual(allowed);
  });
  test('large changes forbidden next to permitted small ones is limited scope (Vim)', () => {
    const rules = [rule('code-small', 'conditional', 'disclosure'), rule('code-tests', 'conditional', 'disclosure'), rule('code-large', 'not-allowed')];
    expect(derivePolicy(rules).contributions).toEqual({ verdict: 'conditional', conditions: ['disclosure', 'limited-scope'] });
  });
  test('scope-limit and size-limit conditions are limited scope; asking first is not', () => {
    expect(derivePolicy([rule('code-large', 'conditional', 'scope-limit')]).contributions.conditions).toEqual(['limited-scope']);
    expect(derivePolicy([rule('code-small', 'conditional', 'size-limit')]).contributions.conditions).toEqual(['limited-scope']);
    expect(derivePolicy([rule('code-large', 'conditional', 'prior-approval')]).contributions).toEqual(allowed);
  });
  test('forbidden documentation alone does not limit code scope (Bevy)', () => {
    const rules = [rule('code-large', 'conditional', 'disclosure'), rule('docs-writing', 'not-allowed')];
    expect(derivePolicy(rules).contributions.conditions).toEqual(['disclosure']);
  });
  test('forbidden code with permitted autocomplete is minor help only (GNOME extensions)', () => {
    const rules = [rule('code-small', 'not-allowed'), rule('code-large', 'not-allowed'), rule('code-completion', 'allowed'), rule('research', 'allowed')];
    const { rating, uses } = deriveArea(rules, 'contributions');
    expect(rating).toEqual({ verdict: 'conditional', conditions: ['minor-assist-only'] });
    expect(uses.sort()).toEqual(['code-completion', 'code-large', 'code-small', 'research']);
  });
  test('everything forbidden is banned', () => {
    expect(derivePolicy([rule('code-large', 'not-allowed'), rule('code-completion', 'not-allowed')]).contributions).toEqual(banned);
  });
  test('discouraged counts as permitted', () => {
    expect(derivePolicy([rule('issue-writing', 'discouraged')]).issues).toEqual(allowed);
  });
  test('forbidden issue text with permitted translation is minor help only, citing the translation rule (niri)', () => {
    const rules = [rule('issue-writing', 'not-allowed'), rule('translation', 'conditional', 'include-original')];
    const { rating, uses } = deriveArea(rules, 'issues');
    expect(rating).toEqual({ verdict: 'conditional', conditions: ['minor-assist-only'] });
    expect(uses).toEqual(['issue-writing', 'translation']);
  });
  test('translation alone does not rate issues', () => {
    expect(derivePolicy([rule('translation', 'allowed')]).issues).toEqual(none);
  });
  test('finding bugs with AI alone rates issues by its conditions (Linux kernel)', () => {
    expect(derivePolicy([rule('issue-finding', 'conditional', 'disclosure', 'human-reviewed')]).issues).toEqual({
      verdict: 'conditional',
      conditions: ['disclosure', 'human-reviewed'],
    });
  });
  test('only minor text help, nothing on AI-written text, is limited scope (curl)', () => {
    expect(derivePolicy([rule('translation', 'allowed')]).summaries).toEqual({ verdict: 'conditional', conditions: ['limited-scope'] });
  });
  test('forbidden reviewer answers alone do not limit text scope (Home Assistant)', () => {
    const rules = [rule('pr-description', 'conditional', 'human-reviewed'), rule('review-answers', 'not-allowed')];
    expect(derivePolicy(rules).summaries).toEqual({ verdict: 'conditional', conditions: ['human-reviewed'] });
  });
  test('forbidden comments next to permitted PR descriptions is limited scope (systemd)', () => {
    const rules = [rule('pr-description', 'conditional', 'human-reviewed'), rule('comments', 'not-allowed')];
    expect(derivePolicy(rules).summaries.conditions).toEqual(['human-reviewed', 'limited-scope']);
  });
  test('a ban on agents rates an otherwise silent area, and adds no-autonomous-agents elsewhere (Matplotlib)', () => {
    const rules = [rule('code-large', 'conditional', 'human-accountable'), rule('agent-contributions', 'not-allowed'), rule('agent-issues', 'not-allowed')];
    const p = derivePolicy(rules);
    expect(p.contributions).toEqual({ verdict: 'conditional', conditions: ['human-accountable', 'no-autonomous-agents'] });
    expect(p.issues).toEqual({ verdict: 'conditional', conditions: ['no-autonomous-agents'] });
    expect(deriveStance(p)).toBe('friendly');
  });
  test('naming AI as author does not rate an area', () => {
    expect(derivePolicy([rule('ai-authorship', 'not-allowed')]).contributions).toEqual(none);
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
