import { describe, expect, test } from 'bun:test';
import { extractHtml, fetchSource, normalizeText, rawUrl } from '../scripts/lib/fetch';
import { quoteAppearsIn } from '../scripts/lib/quotes';

describe('rawUrl', () => {
  test('maps forge file views to raw files', () => {
    expect(rawUrl('https://github.com/curl/curl/blob/master/docs/CONTRIBUTE.md')).toBe(
      'https://raw.githubusercontent.com/curl/curl/master/docs/CONTRIBUTE.md',
    );
    expect(rawUrl('https://gitlab.com/qemu-project/qemu/-/blob/master/README.rst')).toBe(
      'https://gitlab.com/qemu-project/qemu/-/raw/master/README.rst',
    );
    expect(rawUrl('https://codeberg.org/ziglang/zig/src/branch/master/README.md')).toBe(
      'https://codeberg.org/ziglang/zig/raw/branch/master/README.md',
    );
  });
  test('leaves other URLs alone', () => {
    expect(rawUrl('https://docs.kernel.org/process/coding-assistants.html')).toBe(
      'https://docs.kernel.org/process/coding-assistants.html',
    );
    expect(rawUrl('https://github.com/curl/curl')).toBe('https://github.com/curl/curl');
  });
});

describe('extractHtml', () => {
  const html = `<!doctype html><html><head><title>AI Policy</title><script>evil()</script></head><body>
    <nav>Home | Docs</nav>
    <main><h2>Rules</h2><p>You   must
      disclose AI use.</p><ul><li><p>No agents.</p></li><li>Be nice.</li></ul></main>
    <footer>© someone</footer></body></html>`;
  test('keeps main content, drops chrome and scripts', () => {
    const { title, text } = extractHtml(html);
    const out = normalizeText(text);
    expect(title).toBe('AI Policy');
    expect(out).toContain('## Rules');
    expect(out).toContain('You must disclose AI use.');
    expect(out).toContain('- No agents.');
    expect(out).toContain('- Be nice.');
    expect(out).not.toContain('Home | Docs');
    expect(out).not.toContain('evil');
    expect(out).not.toContain('someone');
  });
});

describe('fetchSource', () => {
  test('hashes normalized text and keeps Markdown as-is', async () => {
    const md = '# AI policy\n\nAll AI usage **must** be disclosed.\r\n\n\n\nThanks for contributing to this project.';
    const fake = (async () => new Response(md, { headers: { 'content-type': 'text/plain' } })) as unknown as typeof fetch;
    const src = await fetchSource('https://github.com/a/b/blob/main/AI.md', fake);
    expect(src.title).toBe('AI policy');
    expect(src.text).toBe('# AI policy\n\nAll AI usage **must** be disclosed.\n\nThanks for contributing to this project.\n');
    expect(src.hash).toMatch(/^[a-f0-9]{64}$/);
  });
  test('fails on HTTP errors', async () => {
    const fake = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    await expect(fetchSource('https://example.com/x', fake)).rejects.toThrow('HTTP 404');
  });
});

describe('quoteAppearsIn', () => {
  const text = 'All AI usage **must** be disclosed.\nThe human-in-the-loop must “fully” understand   all code.';
  test('tolerates emphasis, whitespace, case and typographic quotes', () => {
    expect(quoteAppearsIn('all AI usage must be disclosed.', text)).toBe(true);
    expect(quoteAppearsIn('The human-in-the-loop must "fully" understand all code.', text)).toBe(true);
  });
  test('rejects paraphrases and empty quotes', () => {
    expect(quoteAppearsIn('AI usage should be disclosed.', text)).toBe(false);
    expect(quoteAppearsIn('   ', text)).toBe(false);
  });
});
