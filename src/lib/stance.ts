import { CONDITIONS, DIMENSIONS, type Condition, type Dimension, type DimensionPolicy, type Policy, type Rule, type RuleConditionId, type Use } from './schema';

/** The one friendliness scale, used for each area and for the project overall. */
export const STANCES = ['friendly', 'mostly-friendly', 'unfriendly', 'unknown'] as const;
export type Stance = (typeof STANCES)[number];

/**
 * Conditions that any normal contribution already implies; they do not lower the stance.
 * A person driving the tool (no autonomous agents) counts as one: user decision 2026-11-09.
 */
const BASELINE: ReadonlySet<Condition> = new Set(['human-accountable', 'human-reviewed', 'license-compliance', 'no-autonomous-agents']);

/** How friendly one area (code, issues or text) is, from its verdict and conditions. */
export function areaStance({ verdict, conditions }: DimensionPolicy): Stance {
  if (verdict === 'unspecified') return 'unknown';
  if (verdict === 'banned' || conditions.includes('minor-assist-only')) return 'unfriendly';
  if (conditions.every((c) => BASELINE.has(c))) return 'friendly';
  return 'mostly-friendly';
}

/**
 * How each use counts when an area's rating is worked out from a project's rules.
 * - content: AI writes what is submitted in this area. If any is permitted, the area is.
 * - scope: content uses whose ban, next to permitted ones, means AI is allowed only for some kinds of work.
 * - minor: help that does not write the submitted content. Alone, it rates the area "minor help only"
 *   when content uses are forbidden, and otherwise rates the area by its own conditions.
 * - borrowed: minor help recorded in another area that also applies here once content is forbidden
 *   (translating or proofreading one's own text also covers issue text).
 * - agent: bots acting on their own; forbidding them adds "no autonomous agents".
 * Uses not listed (such as naming AI as commit author) are shown but do not change the rating.
 */
const AREA_USES: Record<
  Dimension,
  { content: Use[]; scope: Use[]; minor: Use[]; borrowed: Use[]; agent: Use; minorAloneIsLimited: boolean }
> = {
  contributions: {
    content: ['code-small', 'code-large', 'code-mechanical', 'code-tests', 'code-infra', 'docs-writing'],
    scope: ['code-small', 'code-large', 'code-mechanical', 'code-tests', 'code-infra'],
    minor: ['code-completion', 'research', 'self-review', 'localization', 'assets'],
    borrowed: [],
    agent: 'agent-contributions',
    minorAloneIsLimited: true,
  },
  issues: {
    content: ['issue-writing', 'security-report'],
    scope: ['issue-writing', 'security-report'],
    // Finding bugs with AI is what most issue policies are about, so on its own it rates the area.
    minor: ['issue-finding'],
    borrowed: ['translation', 'proofreading'],
    agent: 'agent-issues',
    minorAloneIsLimited: false,
  },
  summaries: {
    content: ['pr-description', 'commit-message', 'comments', 'review-answers', 'code-review-others', 'posts', 'thread-summaries'],
    // Answering reviewers yourself is part of taking responsibility, not a limit on what AI may write.
    scope: ['pr-description', 'commit-message', 'comments', 'posts'],
    minor: ['translation', 'proofreading', 'quoting-ai'],
    borrowed: [],
    agent: 'agent-comments',
    minorAloneIsLimited: true,
  },
};

/** Required rule conditions as area conditions; the rest (asking first, marking quotes, including the original) are shown on the rule only. */
const AREA_CONDITION: Partial<Record<RuleConditionId, Condition>> = {
  disclosure: 'disclosure',
  'human-accountable': 'human-accountable',
  'human-reviewed': 'human-reviewed',
  'license-compliance': 'license-compliance',
  'no-autonomous-agents': 'no-autonomous-agents',
  'size-limit': 'limited-scope',
  'scope-limit': 'limited-scope',
};

const permitted = (r: Rule) => r.status !== 'not-allowed';

/**
 * One area's verdict and conditions, computed from the rules so that the rating always matches
 * them. `uses` lists the rules it was based on, for the area's evidence.
 */
export function deriveArea(rules: readonly Rule[], dim: Dimension): { rating: DimensionPolicy; uses: Use[] } {
  const spec = AREA_USES[dim];
  const pick = (uses: Use[]) => uses.flatMap((u) => rules.filter((r) => r.use === u));
  const content = pick(spec.content);
  const minor = pick(spec.minor);
  const agent = pick([spec.agent])[0];
  const conditions = new Set<Condition>();
  const addConditions = (from: Rule[]) => {
    for (const r of from) {
      for (const c of r.conditions) {
        const area = AREA_CONDITION[c.condition];
        if (area && c.strength === 'required') conditions.add(area);
      }
    }
  };
  const uses = [...content, ...minor, ...(agent ? [agent] : [])].map((r) => r.use);

  let banned = false;
  if (content.some(permitted)) {
    addConditions(content.filter(permitted));
    if (pick(spec.scope).some((r) => !permitted(r))) conditions.add('limited-scope');
  } else if (content.length) {
    const help = [...minor, ...pick(spec.borrowed)].filter(permitted);
    if (help.length) {
      addConditions(help);
      conditions.add('minor-assist-only');
      uses.push(...help.map((r) => r.use).filter((u) => !uses.includes(u)));
    } else banned = true;
  } else if (minor.length) {
    const help = minor.filter(permitted);
    if (help.length) {
      addConditions(help);
      if (spec.minorAloneIsLimited) conditions.add('limited-scope');
    } else banned = true;
  } else if (agent) {
    if (permitted(agent)) addConditions([agent]);
  } else {
    return { rating: { verdict: 'unspecified', conditions: [] }, uses: [] };
  }
  if (banned) return { rating: { verdict: 'banned', conditions: [] }, uses };
  if (agent && !permitted(agent)) conditions.add('no-autonomous-agents');
  // "Minor help only" already says AI may not write the content; a size or scope limit on that help adds nothing.
  if (conditions.has('minor-assist-only')) conditions.delete('limited-scope');
  const sorted = CONDITIONS.filter((c) => conditions.has(c));
  return { rating: { verdict: sorted.length ? 'conditional' : 'allowed', conditions: sorted }, uses };
}

/** Every area's rating from the rules; areas the rules do not touch are "unspecified". */
export function derivePolicy(rules: readonly Rule[]): Policy {
  return Object.fromEntries(DIMENSIONS.map((d) => [d, deriveArea(rules, d).rating])) as Policy;
}

/**
 * Overall stance is derived from the per-area verdicts so that the same policy
 * always gets the same face, whoever (or whatever) classified it. Code decides;
 * an unfriendly issue or text policy caps a friendly project at mostly friendly.
 */
export function deriveStance(policy: Policy): Stance {
  const code = areaStance(policy.contributions);
  if (code !== 'friendly') return code;
  const others = [policy.issues, policy.summaries].map(areaStance);
  return others.includes('unfriendly') ? 'mostly-friendly' : 'friendly';
}

/**
 * Up to `max` items grouped by stance, keeping list order within each stance.
 * Over the cap, each stance keeps its share (largest remainder) and at least one item.
 */
export function moodSample<T extends { stance: Stance }>(list: readonly T[], max: number): T[] {
  const groups = STANCES.map((s) => list.filter((p) => p.stance === s));
  if (list.length <= max) return groups.flat();
  const exact = groups.map((g) => (g.length * max) / list.length);
  const take = exact.map(Math.floor);
  const spare = max - take.reduce((a, b) => a + b, 0);
  const byRemainder = STANCES.map((_, i) => i).sort((a, b) => (exact[b]! % 1) - (exact[a]! % 1));
  for (const i of byRemainder.slice(0, spare)) take[i]!++;
  for (const [i, g] of groups.entries()) {
    if (g.length && !take[i]) {
      take[i] = 1;
      take[take.indexOf(Math.max(...take))]!--;
    }
  }
  return groups.flatMap((g, i) => g.slice(0, take[i]));
}
