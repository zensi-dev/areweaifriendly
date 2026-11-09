import { expect, test } from 'bun:test';
import { lineDiff } from '../scripts/lib/diff';

const lines = (n: number, prefix = 'line') => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);

test('shows changed lines with context and skips the rest', () => {
  const before = lines(20).join('\n');
  const after = lines(20).map((l) => (l === 'line 10' ? 'line ten' : l)).join('\n');
  expect(lineDiff(before, after)).toBe(['…', '  line 8', '  line 9', '- line 10', '+ line ten', '  line 11', '  line 12', '…'].join('\n'));
});

test('additions and removals in the middle', () => {
  expect(lineDiff('a\nb\nc', 'a\nc\nd')).toBe(['  a', '- b', '  c', '+ d'].join('\n'));
});

test('identical texts give an empty diff', () => {
  expect(lineDiff('a\nb', 'a\nb')).toBe('');
});

test('caps the size', () => {
  const out = lineDiff('', lines(5000).join('\n'), { maxChars: 200 });
  expect(out.length).toBeLessThan(260);
  expect(out).toEndWith('… (diff cut off; read the full source)');
});
