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
  'limited-scope',
] as const;
/** Specific ways of using AI that a policy can allow or forbid; each belongs to one area (see USE_INFO). */
export const USES = [
  'code-completion',
  'code-small',
  'code-large',
  'code-mechanical',
  'code-tests',
  'code-infra',
  'docs-writing',
  'localization',
  'assets',
  'research',
  'self-review',
  'ai-authorship',
  'agent-contributions',
  'issue-finding',
  'issue-writing',
  'security-report',
  'agent-issues',
  'pr-description',
  'commit-message',
  'comments',
  'review-answers',
  'code-review-others',
  'posts',
  'translation',
  'proofreading',
  'quoting-ai',
  'thread-summaries',
  'agent-comments',
] as const;
export const RULE_STATUSES = ['allowed', 'conditional', 'discouraged', 'not-allowed'] as const;
export const RULE_CONDITIONS = [
  'disclosure',
  'human-accountable',
  'human-reviewed',
  'license-compliance',
  'no-autonomous-agents',
  'prior-approval',
  'size-limit',
  'include-original',
  'mark-quotes',
] as const;
export const STRENGTHS = ['required', 'recommended'] as const;
/** Where an uncategorized rule applies; "general" is for rules about AI use as a whole. */
export const RULE_AREAS = ['contributions', 'issues', 'summaries', 'general'] as const;
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
export type Use = (typeof USES)[number];
export type RuleStatus = (typeof RULE_STATUSES)[number];
export type RuleConditionId = (typeof RULE_CONDITIONS)[number];
export type RuleArea = (typeof RULE_AREAS)[number];

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

export const Quote = z.strictObject({
  quote: z.string().min(1),
  sourceUrl: z.url(),
});

export const RuleCondition = z.strictObject({
  condition: z.enum(RULE_CONDITIONS),
  strength: z.enum(STRENGTHS),
  /** How the policy puts it, e.g. "Assisted-by trailer in the commit message". */
  detail: z.string().min(1).optional(),
});

/** What a policy says about one use of AI. Uses a policy does not mention have no rule. */
export const Rule = z.strictObject({
  use: z.enum(USES),
  status: z.enum(RULE_STATUSES),
  conditions: z.array(RuleCondition),
  /** One plain sentence on what the policy says about this use. */
  note: z.string().min(1),
  quotes: z.array(Quote).min(1),
});

/** A rule that fits none of the uses, such as an exemption for core maintainers. */
export const OtherRule = z.strictObject({
  area: z.enum(RULE_AREAS),
  status: z.enum(RULE_STATUSES),
  description: z.string().min(1),
  quotes: z.array(Quote).min(1),
});

/** A document the sources say holds AI rules, but which is not among the sources yet. */
export const ReferencedPolicy = z.strictObject({
  url: z.string().min(1),
  note: z.string().min(1),
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
  /** Detailed rules, one per use the policy addresses; missing on entries classified before rubric version 1. */
  rules: z.array(Rule).optional(),
  otherRules: z.array(OtherRule).optional(),
  referencedPolicies: z.array(ReferencedPolicy).optional(),
  /** Version of the classification rubric the rules were made with. */
  rubricVersion: z.number().int().positive().optional(),
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
export type Quote = z.infer<typeof Quote>;
export type RuleCondition = z.infer<typeof RuleCondition>;
export type Rule = z.infer<typeof Rule>;
export type OtherRule = z.infer<typeof OtherRule>;
export type ReferencedPolicy = z.infer<typeof ReferencedPolicy>;
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
