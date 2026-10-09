import { describe, expect, test } from 'bun:test';
import { parseSubmission, SubmissionError } from '../scripts/lib/issue-form';

const body = `### Project name

Ghostty

### What is it?

Fast, native terminal emulator.

### Homepage

https://ghostty.org

### Source repository

_No response_

### Category

Application

### Policy sources

- https://github.com/ghostty-org/ghostty/blob/main/AI_POLICY.md
https://github.com/ghostty-org/ghostty/blob/main/AI_POLICY.md

### Your reading: AI-assisted code

Allowed with conditions

### Your reading: AI-found issues

None

### Your reading: AI-written text

None

### Anything else?

_No response_`;

describe('parseSubmission', () => {
  test('parses a GitHub issue form body', () => {
    expect(parseSubmission(body)).toEqual({
      name: 'Ghostty',
      description: 'Fast, native terminal emulator.',
      homepage: 'https://ghostty.org/',
      repo: undefined,
      category: 'application',
      sources: ['https://github.com/ghostty-org/ghostty/blob/main/AI_POLICY.md'],
      answers: { contributions: 'conditional' },
    });
  });
  test('ignores optional dropdowns left empty', () => {
    expect(parseSubmission(body.replace('Allowed with conditions', 'None')).answers).toEqual({});
  });
  test('reports every problem at once', () => {
    const bad = body.replace('Application', 'Toaster').replace('https://ghostty.org', 'ghostty.org').replace('Allowed with conditions', 'Maybe');
    try {
      parseSubmission(bad);
      throw new Error('expected a SubmissionError');
    } catch (err) {
      expect(err).toBeInstanceOf(SubmissionError);
      expect((err as SubmissionError).problems).toHaveLength(3);
    }
  });
  test('rejects unknown categories', () => {
    expect(() => parseSubmission(body.replace('Application', 'Toaster'))).toThrow('Unknown category');
  });
  test('rejects non-http sources', () => {
    expect(() => parseSubmission(body.replace('- https://github.com', '- file:///etc/passwd #'))).toThrow();
  });
  test('requires a source', () => {
    const noSources = body.replace(/### Policy sources[\s\S]*?### Anything/, '### Policy sources\n\n_No response_\n\n### Anything');
    expect(() => parseSubmission(noSources)).toThrow('at least one URL');
  });
});
