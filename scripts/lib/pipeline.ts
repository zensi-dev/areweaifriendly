import { DIMENSIONS, type DimensionPolicy, type Project, type Rule, type Source } from '../../src/lib/schema';
import { areaStance, deriveStance } from '../../src/lib/stance';
import { CONDITION_INFO, DIMENSION_INFO, RULE_CONDITION_INFO, RULE_STATUS_INFO, STANCE_INFO, USE_INFO } from '../../src/lib/labels';
import type { Classification } from './classify';
import type { FetchedSource } from './fetch';
import { appendFile } from 'node:fs/promises';

export function toSources(fetched: FetchedSource[], date: string): Source[] {
  return fetched.map((f) => ({ url: f.url, title: f.title, hash: f.hash, fetchedAt: date }));
}

export function stanceLabel(policy: Project['policy']): string {
  return STANCE_INFO[deriveStance(policy)].plain;
}

function areaText(d: DimensionPolicy): string {
  const conditions = d.conditions.map((c) => CONDITION_INFO[c].short).join(', ');
  return `${STANCE_INFO[areaStance(d)].label}${conditions ? ` (${conditions})` : ''}`;
}

/** Areas whose verdict or conditions changed, one Markdown line each. */
export function areaChanges(before: Project['policy'], after: Project['policy']): string[] {
  return DIMENSIONS.filter((d) => JSON.stringify(before[d]) !== JSON.stringify(after[d])).map(
    (d) => `${DIMENSION_INFO[d].label}: ${areaText(before[d])} → ${areaText(after[d])}`,
  );
}

/** A rule as one line of Markdown: use, status and conditions. */
export function ruleLine(r: Rule): string {
  const conditions = r.conditions.map(
    (c) => `${RULE_CONDITION_INFO[c.condition].label}${c.strength === 'recommended' ? ' (recommended)' : ''}${c.detail ? `: ${c.detail}` : ''}`,
  );
  return `${USE_INFO[r.use].label}: ${RULE_STATUS_INFO[r.status].label}${conditions.length ? ` (${conditions.join('; ')})` : ''}`;
}

/** What a rule decides, without its wording or quotes; equal keys mean the same rule. */
function ruleKey(r: Rule): string {
  const conditions = r.conditions.map((c) => `${c.condition}:${c.strength}`).sort();
  return `${r.status}|${conditions.join(',')}`;
}

/** Changes between two rule lists, one Markdown line each; rules missing before count as new. */
export function ruleChanges(before: Rule[] | undefined, after: Rule[]): string[] {
  if (!before) return [`First detailed rule list: ${after.length} rules.`];
  const lines: string[] = [];
  for (const r of after) {
    const old = before.find((b) => b.use === r.use);
    if (!old) lines.push(`Added: ${ruleLine(r)}`);
    else if (ruleKey(old) !== ruleKey(r)) lines.push(`Changed: ${ruleLine(old)} → ${ruleLine(r)}`);
  }
  for (const b of before) if (!after.some((r) => r.use === b.use)) lines.push(`Removed: ${ruleLine(b)}`);
  return lines;
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
