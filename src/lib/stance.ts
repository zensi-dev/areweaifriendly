import type { Condition, DimensionPolicy, Policy } from './schema';

/** The one friendliness scale, used for each area and for the project overall. */
export const STANCES = ['friendly', 'mostly-friendly', 'unfriendly', 'unknown'] as const;
export type Stance = (typeof STANCES)[number];

/** Conditions that any normal contribution already implies; they do not lower the stance. */
const BASELINE: ReadonlySet<Condition> = new Set(['human-accountable', 'human-reviewed', 'license-compliance']);

/** How friendly one area (code, issues or text) is, from its verdict and conditions. */
export function areaStance({ verdict, conditions }: DimensionPolicy): Stance {
  if (verdict === 'unspecified') return 'unknown';
  if (verdict === 'banned' || conditions.includes('minor-assist-only')) return 'unfriendly';
  if (conditions.every((c) => BASELINE.has(c))) return 'friendly';
  return 'mostly-friendly';
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
