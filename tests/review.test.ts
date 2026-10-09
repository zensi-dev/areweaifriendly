import { describe, expect, test } from 'bun:test';
import type { Classification } from '../scripts/lib/classify';
import type { Submission } from '../scripts/lib/issue-form';
import { decide, md, renderComment, renderPrBody, REVIEW_MARKER } from '../scripts/lib/review';

const submission: Submission = {
  name: 'Example',
  description: 'An example.',
  homepage: 'https://example.org/',
  category: 'tool',
  sources: ['https://example.org/AI_POLICY.md'],
  answers: { contributions: 'conditional', issues: 'allowed' },
};

const classification: Classification = {
  summary: 'AI code is fine if disclosed; AI bug reports are not.',
  confidence: 'high',
  policy: {
    contributions: { verdict: 'conditional', conditions: ['disclosure'] },
    issues: { verdict: 'banned', conditions: [] },
    summaries: { verdict: 'unspecified', conditions: [] },
  },
  evidence: [{ dimension: 'contributions', quote: 'You may use AI tools if you disclose it.', sourceUrl: submission.sources[0] }],
  sources: [{ url: submission.sources[0], publisher: 'project', isPolicy: true, note: 'The AI policy.' }],
  warnings: [],
};

describe('decide', () => {
  test('accepts project policies and flags disagreement with the submitter', () => {
    const r = decide(submission, classification);
    expect(r.problems).toEqual([]);
    expect(r.flags).toEqual([
      'Issues & bug reports: the submitter said "Allowed", the review says "Banned".',
    ]);
  });
  test('asks for changes when a source is third-party or not a policy', () => {
    const c = structuredClone(classification);
    c.sources = [
      { url: 'https://news.example/a', publisher: 'third-party', isPolicy: true, note: 'A news article.' },
      { url: 'https://example.org/', publisher: 'project', isPolicy: false, note: 'The home page.' },
    ];
    const r = decide(submission, c);
    expect(r.problems).toEqual([
      "https://news.example/a doesn't look like it was published by Example: A news article.",
      "https://example.org/ doesn't look like a policy or contributor guide: The home page.",
    ]);
  });
  test('only flags doubtful pages the research agent found on its own', () => {
    const c = structuredClone(classification);
    c.sources.push({ url: 'https://example.org/blog', publisher: 'project', isPolicy: false, note: 'A blog post.' });
    const r = decide({ ...submission, answers: {} }, c, { found: ['https://example.org/blog'], notes: 'Found a blog post.' });
    expect(r.problems).toEqual([]);
    expect(r.flags).toEqual(["https://example.org/blog doesn't look like a policy or contributor guide: A blog post."]);
    const comment = renderComment(r, { editTriggersReview: true });
    expect(comment).toContain('- https://example.org/blog: published by the project, **not a policy**, found by the review.');
    expect(comment).toContain('**Research**\n\nFound a blog post.');
  });
  test('flags doubtful output without rejecting it', () => {
    const c = structuredClone(classification);
    c.confidence = 'low';
    c.sources[0].publisher = 'unclear';
    c.warnings = ['issues: verdict "banned" has no verified quote.'];
    const r = decide({ ...submission, answers: {} }, c);
    expect(r.problems).toEqual([]);
    expect(r.flags).toHaveLength(3);
  });
});

describe('rendering', () => {
  test('md neutralises markup and mentions from untrusted text', () => {
    expect(md('Hi @octocat <img src=x>\n# [link](http://x)')).toBe('Hi @​octocat \\<img src=x\\> \\# \\[link\\](http://x)');
  });
  test('comment starts with the marker and explains the next step', () => {
    const accepted = renderComment(decide(submission, classification), { editTriggersReview: true });
    expect(accepted).toStartWith(`${REVIEW_MARKER}\n### Review passed`);
    expect(accepted).toContain('| Issues & bug reports | Banned | Allowed (differs) |');
    expect(accepted).toContain('| Code contributions | Allowed with conditions: AI use must be disclosed | Allowed with conditions |');

    const rejected = { submission, problems: ['Fix this.'], flags: [] };
    expect(renderComment(rejected, { editTriggersReview: true })).toContain('runs again automatically');
    expect(renderComment(rejected, { editTriggersReview: false })).toContain('a maintainer will start the next one');
  });
  test('pull request body closes the issue', () => {
    expect(renderPrBody(decide(submission, classification), 7)).toEndWith('Closes #7');
  });
});
