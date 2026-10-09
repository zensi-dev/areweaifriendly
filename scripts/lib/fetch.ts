import { createHash } from 'node:crypto';
import { parseHTML } from 'linkedom';

const USER_AGENT = 'areweaifriendly-bot/1.0 (+https://areweaifriendly.com/about/)';
const TIMEOUT_MS = 30_000;

export type FetchedSource = { url: string; title: string; text: string; hash: string };

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Maps forge "view file" pages to their raw file, so we get Markdown instead of page chrome. */
export function rawUrl(url: string): string {
  const u = new URL(url);
  if (u.hostname === 'github.com') {
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
  }
  if (u.hostname === 'gitlab.com' || u.hostname.startsWith('gitlab.')) {
    if (u.pathname.includes('/-/blob/')) return `${u.origin}${u.pathname.replace('/-/blob/', '/-/raw/')}`;
  }
  if (u.hostname === 'codeberg.org') {
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/src\/(.+)$/);
    if (m) return `${u.origin}/${m[1]}/${m[2]}/raw/${m[3]}`;
  }
  return url;
}

export async function fetchSource(url: string, fetchImpl: typeof fetch = fetch): Promise<FetchedSource> {
  const res = await fetchImpl(rawUrl(url), {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/markdown,text/plain;q=0.9,*/*;q=0.5' },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const body = await res.text();
  const contentType = res.headers.get('content-type') ?? '';
  const isHtml = contentType.includes('html') || /^\s*<(!doctype html|html)/i.test(body);
  const { title, text } = isHtml ? extractHtml(body) : extractPlain(body, url);
  const normalized = normalizeText(text);
  if (normalized.length < 50) throw new Error(`No readable text at ${url}`);
  return { url, title: title || new URL(url).hostname, text: normalized, hash: sha256(normalized) };
}

const DROP = 'script,style,noscript,template,svg,nav,header,footer,aside,form,button,iframe,dialog';
const BLOCK = new Set([
  'ADDRESS', 'ARTICLE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE', 'H1', 'H2', 'H3', 'H4',
  'H5', 'H6', 'HR', 'LI', 'MAIN', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TD', 'TH', 'TR', 'UL',
]);

export function extractHtml(html: string): { title: string; text: string } {
  const { document } = parseHTML(html);
  const title = (document.querySelector('title')?.textContent ?? document.querySelector('h1')?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  for (const el of document.querySelectorAll(DROP)) el.remove();
  const root = document.querySelector('main, article, [role="main"]') ?? document.body ?? document.documentElement;
  const out: string[] = [];
  walk(root, out);
  return { title, text: out.join('') };
}

function walk(node: Node, out: string[]): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      out.push((child.textContent ?? '').replace(/\s+/g, ' '));
      continue;
    }
    if (child.nodeType !== 1) continue;
    const tag = (child as Element).tagName.toUpperCase();
    if (tag === 'BR') {
      out.push('\n');
      continue;
    }
    if (tag === 'PRE') {
      out.push(`\n${child.textContent ?? ''}\n`);
      continue;
    }
    const block = BLOCK.has(tag);
    if (block) out.push('\n');
    if (/^H[1-6]$/.test(tag)) out.push(`${'#'.repeat(Number(tag[1]))} `);
    if (tag === 'LI') out.push('- ');
    walk(child, out);
    if (block) out.push('\n');
  }
}

function extractPlain(body: string, url: string): { title: string; text: string } {
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const file = new URL(url).pathname.split('/').filter(Boolean).pop();
  return { title: heading ?? file ?? '', text: body };
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/^\s+/, '')
    .replace(/^- *\n+/gm, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
    .concat('\n');
}
