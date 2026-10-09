import type { Project, Source } from '../../src/lib/schema';
import { deriveStance } from '../../src/lib/stance';
import { STANCE_INFO } from '../../src/lib/labels';
import type { Classification } from './classify';
import type { FetchedSource } from './fetch';
import { appendFile } from 'node:fs/promises';

export function toSources(fetched: FetchedSource[], date: string): Source[] {
  return fetched.map((f) => ({ url: f.url, title: f.title, hash: f.hash, fetchedAt: date }));
}

export function stanceLabel(policy: Project['policy']): string {
  return STANCE_INFO[deriveStance(policy)].plain;
}

export function reviewNotes(c: Classification): string {
  const lines = [`Confidence: **${c.confidence}**`];
  if (c.warnings.length) lines.push('', '**Needs a closer look:**', ...c.warnings.map((w) => `- ${w}`));
  return lines.join('\n');
}

/** Writes key=value pairs for later workflow steps; a no-op outside GitHub Actions. */
export async function setOutputs(values: Record<string, string>): Promise<void> {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  await appendFile(file, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(''));
}
