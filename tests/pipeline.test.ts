import { describe, expect, test } from 'bun:test';
import type { Classification } from '../scripts/lib/classify';
import type { FetchedSource } from '../scripts/lib/fetch';
import { areaChanges, mapLimit, mergeClassification, ruleChanges, ruleLine } from '../scripts/lib/pipeline';
import type { Policy, Project, Rule } from '../src/lib/schema';

const quote = [{ quote: 'q', sourceUrl: 'https://example.org/' }];
const tests: Rule = { use: 'code-tests', status: 'allowed', conditions: [], note: 'Tests are fine.', quotes: quote };
const translation: Rule = {
  use: 'translation',
  status: 'conditional',
  conditions: [{ condition: 'include-original', strength: 'required' }],
  note: 'Include the original.',
  quotes: quote,
};

describe('ruleLine', () => {
  test('names the use, status and conditions', () => {
    expect(ruleLine(translation)).toBe('Translating own text: Allowed with conditions (Include the original)');
  });
});

describe('ruleChanges', () => {
  test('entries without rules get one summary line', () => {
    expect(ruleChanges(undefined, [tests])).toEqual(['First detailed rule list: 1 rules.']);
  });
  test('ignores wording and quote changes', () => {
    expect(ruleChanges([tests], [{ ...tests, note: 'Reworded.', quotes: [{ ...quote[0], quote: 'other' }] }])).toEqual([]);
  });
  test('reports added, changed and removed rules', () => {
    const notAllowed: Rule = { ...translation, status: 'not-allowed', conditions: [] };
    expect(ruleChanges([tests, translation], [notAllowed, { ...tests, use: 'code-small' }])).toEqual([
      'Changed: Translating own text: Allowed with conditions (Include the original) → Not allowed',
      'Added: Small fixes: Allowed',
      'Removed: Tests: Allowed',
    ]);
  });
  test('groups uses with the same change, leaves out condition wording, and marks unchanged source wording', () => {
    const disclose = (r: Rule): Rule => ({ ...r, status: 'conditional', conditions: [{ condition: 'disclosure', strength: 'required', detail: 'Assisted-by' }] });
    const small: Rule = { ...tests, use: 'code-small' };
    expect(ruleChanges([tests, small], [disclose(tests), disclose(small)], (r) => r.use === 'code-tests')).toEqual([
      'Changed: Tests: Allowed → Allowed with conditions (Disclose AI use) *(source wording unchanged)*',
      'Changed: Small fixes: Allowed → Allowed with conditions (Disclose AI use)',
    ]);
    expect(ruleChanges([tests, small], [disclose(tests), disclose(small)])).toEqual([
      'Changed: Tests, Small fixes: Allowed → Allowed with conditions (Disclose AI use)',
    ]);
  });
});

describe('mergeClassification', () => {
  const url = 'https://example.org/';
  const text = 'You may use AI to write tests.\nTranslations must include the original.\n';
  const fetched: FetchedSource[] = [{ url, title: 'Policy', text, hash: 'b'.repeat(64) }];
  const q = (quote: string) => [{ quote, sourceUrl: url }];
  const storedTests: Rule = { ...tests, note: 'Stored wording.', quotes: q('You may use AI to write tests.') };
  const project: Project = {
    name: 'Example',
    description: 'An example.',
    category: 'tool',
    homepage: url,
    summary: 'Stored summary.',
    policy: {
      contributions: { verdict: 'allowed', conditions: [] },
      issues: { verdict: 'unspecified', conditions: [] },
      summaries: { verdict: 'unspecified', conditions: [] },
    },
    evidence: [{ dimension: 'contributions', quote: 'You may use AI to write tests.', sourceUrl: url }],
    sources: [{ url, title: 'Policy', hash: 'a'.repeat(64), fetchedAt: '2026-10-25' }],
    rules: [storedTests],
    otherRules: [],
    referencedPolicies: [],
    rubricVersion: 1,
    confidence: 'high',
    classifiedBy: 'manual',
    classifiedAt: '2026-10-25',
    lastChanged: '2026-10-25',
  };
  const result = (rules: Rule[], extra: Partial<Classification> = {}): Classification => ({
    summary: 'New summary.',
    confidence: 'medium',
    policy: project.policy,
    evidence: [],
    rules,
    otherRules: [],
    referencedPolicies: [],
    sources: [],
    changeNotes: [],
    warnings: [],
    ...extra,
  });

  test('same rules: nothing to review, stored wording and summary stay, sources refresh', () => {
    const m = mergeClassification(project, result([{ ...tests, note: 'Reworded.', quotes: q('You may use AI to write tests.') }]), fetched, '2026-11-09');
    expect(m.needsReview).toBe(false);
    expect(m.project.rules).toEqual([storedTests]);
    expect(m.project.summary).toBe('Stored summary.');
    expect(m.project.classifiedBy).toBe('manual');
    expect(m.project.lastChanged).toBe('2026-10-25');
    expect(m.project.sources[0]).toEqual({ url, title: 'Policy', hash: 'b'.repeat(64), fetchedAt: '2026-11-09' });
  });
  test('a stored quote that is gone from the text is replaced without needing review', () => {
    const moved = { ...project, rules: [{ ...storedTests, quotes: q('AI may write tests.') }] };
    const fresh = { ...tests, quotes: q('You may use AI to write tests.') };
    const m = mergeClassification(moved, result([fresh]), fetched, '2026-11-09');
    expect(m.needsReview).toBe(false);
    expect(m.project.rules).toEqual([fresh]);
  });
  test('a changed rule needs review and takes the new entry; ratings follow the rules', () => {
    const banned: Rule = { ...tests, status: 'not-allowed', quotes: q('You may use AI to write tests.') };
    const m = mergeClassification(project, result([banned]), fetched, '2026-11-09');
    expect(m.needsReview).toBe(true);
    expect(m.ruleChanges).toEqual(['Changed: Tests: Allowed → Not allowed *(source wording unchanged)*']);
    expect(m.areaChanges).toEqual(['Code contributions: Friendly → Unfriendly']);
    expect(m.project.policy.contributions).toEqual({ verdict: 'banned', conditions: [] });
    expect(m.project).toMatchObject({ summary: 'New summary.', classifiedBy: 'ai', lastChanged: '2026-11-09', rubricVersion: 2 });
  });
  test('a newly referenced document needs review even when the rules are the same', () => {
    const m = mergeClassification(project, result([storedTests], { referencedPolicies: [{ url: 'CODE_OF_CONDUCT.md', note: 'AI in discussions.' }] }), fetched, '2026-11-09');
    expect(m.needsReview).toBe(true);
    expect(m.ruleChanges).toEqual([]);
  });
  test('entries without rules always need review', () => {
    const m = mergeClassification({ ...project, rules: undefined }, result([storedTests]), fetched, '2026-11-09');
    expect(m.needsReview).toBe(true);
    expect(m.ruleChanges).toEqual(['First detailed rule list: 1 rules.']);
  });
});

test('areaChanges lists only areas that changed', () => {
  const before: Policy = {
    contributions: { verdict: 'conditional', conditions: ['minor-assist-only'] },
    issues: { verdict: 'unspecified', conditions: [] },
    summaries: { verdict: 'unspecified', conditions: [] },
  };
  const after: Policy = { ...before, contributions: { verdict: 'conditional', conditions: ['disclosure', 'limited-scope'] } };
  expect(areaChanges(before, after)).toEqual(['Code contributions: Unfriendly (Minor help only) → Mostly friendly (Disclose, Limited scope)']);
});

test('areaChanges ignores the order of conditions', () => {
  const before: Policy = {
    contributions: { verdict: 'conditional', conditions: ['human-accountable', 'human-reviewed'] },
    issues: { verdict: 'unspecified', conditions: [] },
    summaries: { verdict: 'unspecified', conditions: [] },
  };
  const after: Policy = { ...before, contributions: { verdict: 'conditional', conditions: ['human-reviewed', 'human-accountable'] } };
  expect(areaChanges(before, after)).toEqual([]);
});

describe('mapLimit', () => {
  test('keeps input order and never runs more than the limit at once', async () => {
    let running = 0;
    let peak = 0;
    const result = await mapLimit([30, 5, 20, 1, 10], 2, async (ms) => {
      peak = Math.max(peak, ++running);
      await Bun.sleep(ms);
      running--;
      return ms * 2;
    });
    expect(result).toEqual([60, 10, 40, 2, 20]);
    expect(peak).toBe(2);
  });
  test('handles an empty list', async () => {
    expect(await mapLimit([], 4, async (x) => x)).toEqual([]);
  });
});
