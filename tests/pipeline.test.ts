import { describe, expect, test } from 'bun:test';
import { areaChanges, ruleChanges, ruleLine } from '../scripts/lib/pipeline';
import type { Policy, Rule } from '../src/lib/schema';

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
      'Changed: Translating own text: Allowed with conditions (Include the original) → Translating own text: Not allowed',
      'Added: Small fixes: Allowed',
      'Removed: Tests: Allowed',
    ]);
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
