import { z } from 'zod';

export const DIMENSIONS = ['contributions', 'issues', 'summaries'] as const;
export const VERDICTS = ['allowed', 'conditional', 'banned', 'unspecified'] as const;
export const CONDITIONS = [
  'disclosure',
  'human-accountable',
  'human-reviewed',
  'license-compliance',
  'no-autonomous-agents',
  'minor-assist-only',
] as const;
export const CATEGORIES = [
  'operating-system',
  'distribution',
  'language',
  'library',
  'framework',
  'tool',
  'application',
  'foundation',
] as const;
export const CONFIDENCE = ['high', 'medium', 'low'] as const;

export type Dimension = (typeof DIMENSIONS)[number];
export type Verdict = (typeof VERDICTS)[number];
export type Condition = (typeof CONDITIONS)[number];
export type Category = (typeof CATEGORIES)[number];

export const DimensionPolicy = z.strictObject({
  verdict: z.enum(VERDICTS),
  conditions: z.array(z.enum(CONDITIONS)),
});

export const Policy = z.strictObject({
  contributions: DimensionPolicy,
  issues: DimensionPolicy,
  summaries: DimensionPolicy,
});

export const Evidence = z.strictObject({
  dimension: z.enum(DIMENSIONS),
  quote: z.string().min(1),
  sourceUrl: z.url(),
});

export const Source = z.strictObject({
  url: z.url(),
  title: z.string().min(1),
  /** sha256 of the snapshot text; the weekly check compares against it. */
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  fetchedAt: z.iso.date(),
});

export const Project = z.strictObject({
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(CATEGORIES),
  homepage: z.url(),
  repo: z.url().optional(),
  summary: z.string().min(1),
  policy: Policy,
  evidence: z.array(Evidence),
  sources: z.array(Source).min(1),
  confidence: z.enum(CONFIDENCE),
  /** "ai" or "manual" for hand-reviewed entries. Never the model name, so the AI provider stays private. */
  classifiedBy: z.enum(['ai', 'manual']),
  classifiedAt: z.iso.date(),
  /** Last date the policy verdicts changed. */
  lastChanged: z.iso.date(),
});

export type DimensionPolicy = z.infer<typeof DimensionPolicy>;
export type Policy = z.infer<typeof Policy>;
export type Evidence = z.infer<typeof Evidence>;
export type Source = z.infer<typeof Source>;
export type Project = z.infer<typeof Project>;
export type ProjectWithSlug = Project & { slug: string };

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
