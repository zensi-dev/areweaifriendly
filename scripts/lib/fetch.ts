import { createHash } from 'node:crypto';
import { parseHTML } from 'linkedom';

export const USER_AGENT = 'areweaifriendly-bot/1.0 (+https://areweaifriendly.com/about/)';
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

export type Link = { text: string; url: string };

const MAX_REDIRECTS = 5;
const MAX_LINKS = 200;

/**
 * Rejects URLs that point at the runner itself or a private network. Checks the host name only
 * (no DNS lookup), which covers literal addresses and the usual local names.
 */
export function assertPublicUrl(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error(`Not an http(s) URL: ${url}`);
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const privateHost =
    host === 'localhost' ||
    /\.(localhost|local|internal|home|lan)$/.test(host) ||
    (!host.includes('.') && !host.includes(':')) ||
    /^(0|10|127)\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
    (host.includes(':') && (host === '::' || host === '::1' || /^(fc|fd|fe[89ab])/.test(host) || host.startsWith('::ffff:')));
  if (privateHost) throw new Error(`Not a public address: ${url}`);
  return u;
}

export async function fetchSource(url: string, fetchImpl: typeof fetch = fetch): Promise<FetchedSource> {
  return (await fetchPage(url, fetchImpl)).source;
}

/** Fetches a page as plain text, plus the links on it resolved to absolute URLs. */
export async function fetchPage(url: string, fetchImpl: typeof fetch = fetch): Promise<{ source: FetchedSource; links: Link[] }> {
  // Redirects are followed by hand so every hop is checked.
  let target = rawUrl(url);
  let res: Response;
  for (let hop = 0; ; hop++) {
    assertPublicUrl(target);
    res = await fetchImpl(target, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/markdown,text/plain;q=0.9,*/*;q=0.5' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) break;
    if (hop >= MAX_REDIRECTS) throw new Error(`Too many redirects fetching ${url}`);
    target = new URL(location, target).toString();
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const body = await res.text();
  const contentType = res.headers.get('content-type') ?? '';
  const isHtml = contentType.includes('html') || /^\s*<(!doctype html|html)/i.test(body);
  // Relative links in a raw forge file are relative to its "view file" page, which is what readers see.
  const base = target === rawUrl(url) ? url : target;
  const links = isHtml ? extractHtmlLinks(body, base) : extractTextLinks(body, base);
  const { title, text } = isHtml ? extractHtml(body) : extractPlain(body, url);
  const normalized = normalizeText(text);
  if (normalized.length < 50) throw new Error(`No readable text at ${url}`);
  return { source: { url, title: title || new URL(url).hostname, text: normalized, hash: sha256(normalized) }, links };
}

function linkList(pairs: Iterable<[string, string]>, base: string): Link[] {
  const seen = new Map<string, Link>();
  for (const [rawText, href] of pairs) {
    let u: URL;
    try {
      u = new URL(href.trim(), base);
    } catch {
      continue;
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') continue;
    u.hash = '';
    const url = u.toString();
    const text = rawText.replace(/\s+/g, ' ').trim().slice(0, 120);
    const known = seen.get(url);
    if (!known) seen.set(url, { text, url });
    else if (!known.text && text) known.text = text;
    if (seen.size >= MAX_LINKS) break;
  }
  return [...seen.values()];
}

/** Every link in the page, navigation included: a "Contributing" menu entry is often the way to the policy. */
export function extractHtmlLinks(html: string, base: string): Link[] {
  const { document } = parseHTML(html);
  const baseHref = document.querySelector('base[href]')?.getAttribute('href');
  const resolved = baseHref ? new URL(baseHref, base).toString() : base;
  const anchors = Array.from(document.querySelectorAll('a[href]')) as Element[];
  return linkList(
    anchors.map((a) => [a.textContent ?? '', a.getAttribute('href') ?? ''] as [string, string]),
    resolved,
  );
}

/** Markdown links, reStructuredText links and bare URLs in a plain-text file. */
export function extractTextLinks(text: string, base: string): Link[] {
  const pairs: [string, string][] = [];
  for (const m of text.matchAll(/\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) pairs.push([m[1], m[2]]);
  for (const m of text.matchAll(/^\s*\[([^\]]+)\]:\s*<?(\S+?)>?(?:\s|$)/gm)) pairs.push([m[1], m[2]]);
  for (const m of text.matchAll(/`([^`<]+?)\s*<([^>]+)>`_/g)) pairs.push([m[1], m[2]]);
  for (const m of text.matchAll(/https?:\/\/[^\s<>()\[\]"'`]+[^\s<>()\[\]"'`.,;:!?]/g)) pairs.push(['', m[0]]);
  return linkList(pairs, base);
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
