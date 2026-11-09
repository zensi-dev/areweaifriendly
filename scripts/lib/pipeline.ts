import { DIMENSIONS, type DimensionPolicy, type OtherRule, type Project, type Quote, type Rule, type Source } from '../../src/lib/schema';
import { areaStance, deriveStance } from '../../src/lib/stance';
import { CONDITION_INFO, DIMENSION_INFO, RULE_CONDITION_INFO, RULE_STATUS_INFO, STANCE_INFO, USE_INFO } from '../../src/lib/labels';
import { rate, RUBRIC_VERSION, type Classification } from './classify';
import type { FetchedSource } from './fetch';
import { quoteAppearsIn } from './quotes';
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
  const same = (a: DimensionPolicy, b: DimensionPolicy) =>
    a.verdict === b.verdict && a.conditions.length === b.conditions.length && a.conditions.every((c) => b.conditions.includes(c));
  return DIMENSIONS.filter((d) => !same(before[d], after[d])).map(
    (d) => `${DIMENSION_INFO[d].label}: ${areaText(before[d])} → ${areaText(after[d])}`,
  );
}

/** A rule's status and conditions as Markdown; `details` adds how the policy words each condition. */
function ruleStatusText(r: Rule, details = true): string {
  const conditions = r.conditions.map(
    (c) =>
      `${RULE_CONDITION_INFO[c.condition].label}${c.strength === 'recommended' ? ' (recommended)' : ''}${details && c.detail ? `: ${c.detail}` : ''}`,
  );
  return `${RULE_STATUS_INFO[r.status].label}${conditions.length ? ` (${conditions.join('; ')})` : ''}`;
}

/** A rule as one line of Markdown: use, status and conditions. */
export function ruleLine(r: Rule): string {
  return `${USE_INFO[r.use].label}: ${ruleStatusText(r)}`;
}

/** What a rule decides, without its wording or quotes; equal keys mean the same rule. */
function ruleKey(r: Rule): string {
  const conditions = r.conditions.map((c) => `${c.condition}:${c.strength}`).sort();
  return `${r.status}|${conditions.join(',')}`;
}

/**
 * Changes between two rule lists, one Markdown line each; uses with the same change share a line.
 * Rules missing before count as new. `stillQuoted` marks old rules whose quotes are all still in the
 * sources, which hints that the model changed its reading rather than the policy its wording.
 */
export function ruleChanges(before: Rule[] | undefined, after: Rule[], stillQuoted: (r: Rule) => boolean = () => false): string[] {
  if (!before) return [`First detailed rule list: ${after.length} rules.`];
  const groups = new Map<string, string[]>();
  const add = (kind: string, change: string, use: Rule['use']) => {
    const key = `${kind}\u0000${change}`;
    groups.set(key, [...(groups.get(key) ?? []), USE_INFO[use].label]);
  };
  const unchangedText = (old: Rule) => (stillQuoted(old) ? ' *(source wording unchanged)*' : '');
  for (const r of after) {
    const old = before.find((b) => b.use === r.use);
    if (!old) add('Added', ruleStatusText(r, false), r.use);
    else if (ruleKey(old) !== ruleKey(r)) add('Changed', `${ruleStatusText(old, false)} → ${ruleStatusText(r, false)}${unchangedText(old)}`, r.use);
  }
  for (const b of before) if (!after.some((r) => r.use === b.use)) add('Removed', `${ruleStatusText(b, false)}${unchangedText(b)}`, b.use);
  return [...groups].map(([key, uses]) => {
    const [kind, change] = key.split('\u0000');
    return `${kind}: ${uses.join(', ')}: ${change}`;
  });
}

/** The same other rules by area and status, ignoring wording. */
function sameOtherRules(a: OtherRule[] = [], b: OtherRule[] = []): boolean {
  const key = (list: OtherRule[]) => list.map((o) => `${o.area}|${o.status}`).sort().join(',');
  return key(a) === key(b);
}

export type Merged = {
  /** The project as it should be written. */
  project: Project;
  /** True when a person should review it: rules, ratings, other rules or referenced documents changed. */
  needsReview: boolean;
  ruleChanges: string[];
  areaChanges: string[];
};

/**
 * Combines a new classification with the stored entry so only real changes show up. Rules whose
 * status and conditions are unchanged keep their stored wording and quotes, as long as those quotes
 * are still in the sources. When nothing needs review, the stored summary and rules stay, and only
 * the sources (and any quote the new text forced) are refreshed.
 */
export function mergeClassification(project: Project, result: Classification, fetched: FetchedSource[], date: string): Merged {
  const quoted = (quotes: Quote[]) =>
    quotes.every((q) => {
      const source = fetched.find((f) => f.url === q.sourceUrl);
      return source !== undefined && quoteAppearsIn(q.quote, source.text);
    });
  const rules = result.rules.map((r) => {
    const old = project.rules?.find((o) => o.use === r.use);
    return old && ruleKey(old) === ruleKey(r) && quoted(old.quotes) ? old : r;
  });
  const keepOtherRules = sameOtherRules(project.otherRules, result.otherRules) && quoted((project.otherRules ?? []).flatMap((o) => o.quotes));
  const otherRules = keepOtherRules ? (project.otherRules ?? []) : result.otherRules;
  const { policy, evidence } = rate(rules, otherRules);

  const changes = ruleChanges(project.rules, rules, (r) => quoted(r.quotes));
  const areas = areaChanges(project.policy, policy);
  const knownPolicies = new Set((project.referencedPolicies ?? []).map((p) => p.url));
  const newPolicies = result.referencedPolicies.some((p) => !knownPolicies.has(p.url));
  const needsReview = changes.length > 0 || areas.length > 0 || !keepOtherRules || newPolicies;

  const sources = toSources(fetched, date).map((s, i) => (fetched[i]!.hash === project.sources[i]?.hash ? project.sources[i]! : s));
  const merged: Project = needsReview
    ? {
        ...project,
        summary: result.summary,
        policy,
        evidence,
        rules,
        otherRules,
        referencedPolicies: result.referencedPolicies,
        rubricVersion: RUBRIC_VERSION,
        sources,
        confidence: result.confidence,
        classifiedBy: 'ai',
        classifiedAt: date,
        lastChanged: changes.length || areas.length ? date : project.lastChanged,
      }
    : { ...project, policy, evidence, rules, otherRules, sources };
  return { project: merged, needsReview, ruleChanges: changes, areaChanges: areas };
}

export function reviewNotes(c: Classification): string {
  const lines = [`Confidence: **${c.confidence}**`];
  if (c.warnings.length) lines.push('', '**Needs a closer look:**', ...c.warnings.map((w) => `- ${w}`));
  return lines.join('\n');
}

/**
 * Runs `fn` on every item with at most `limit` calls in flight, starting the next item as soon as
 * one finishes. Results keep the order of `items`.
 */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Writes key=value pairs for later workflow steps; a no-op outside GitHub Actions. */
export async function setOutputs(values: Record<string, string>): Promise<void> {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  await appendFile(file, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(''));
}
