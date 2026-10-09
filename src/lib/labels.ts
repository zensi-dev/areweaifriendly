import type { IconName } from './icons';
import type { Category, Condition, Dimension } from './schema';
import type { Stance } from './stance';

/**
 * How friendly a project is towards AI-assisted contributions, shown with a
 * face tile. `plain` is the literal wording for titles, search engines and AI agents.
 */
export const STANCE_INFO: Record<Stance, { label: string; plain: string; tagline: string; meaning: string }> = {
  friendly: {
    label: 'Friendly',
    plain: 'AI-friendly',
    tagline: 'Welcomes AI-assisted work.',
    meaning: 'AI-assisted contributions are welcome under the same rules as any other contribution.',
  },
  'mostly-friendly': {
    label: 'Mostly friendly',
    plain: 'AI-friendly with conditions',
    tagline: 'Welcome, with extra rules.',
    meaning: 'AI-assisted contributions are accepted with extra rules, such as disclosing AI use, or AI is banned for issues or written text.',
  },
  unfriendly: {
    label: 'Unfriendly',
    plain: 'Not AI-friendly',
    tagline: 'Doesn’t accept AI-generated work.',
    meaning: 'AI-generated contributions are not accepted; at most minor help such as autocomplete or grammar fixes.',
  },
  unknown: {
    label: 'No policy',
    plain: 'No AI policy',
    tagline: 'No policy yet.',
    meaning: 'No published policy on AI-assisted contributions.',
  },
};

export const DIMENSION_INFO: Record<Dimension, { label: string; short: string; icon: IconName; meaning: string }> = {
  contributions: {
    label: 'Code contributions',
    short: 'Code',
    icon: 'code',
    meaning: 'Patches, pull requests and other changes written with AI tools.',
  },
  issues: {
    label: 'Issues & bug reports',
    short: 'Issues',
    icon: 'issue',
    meaning: 'Bug reports, security reports and issues found or written with AI tools.',
  },
  summaries: {
    label: 'AI-written text',
    short: 'Text',
    icon: 'text',
    meaning: 'Pull request descriptions, issue comments and summaries written by AI.',
  },
};

export const CONDITION_INFO: Record<Condition, { label: string; short: string; icon: IconName }> = {
  disclosure: { label: 'AI use must be disclosed', short: 'Disclose', icon: 'tag' },
  'human-accountable': { label: 'Contributor takes full responsibility', short: 'Accountable', icon: 'user-check' },
  'human-reviewed': { label: 'A human must review the output', short: 'Human review', icon: 'eye' },
  'license-compliance': { label: 'Output must be license-compatible', short: 'License-safe', icon: 'scale' },
  'no-autonomous-agents': { label: 'No autonomous agents', short: 'No agents', icon: 'bot-off' },
  'minor-assist-only': { label: 'Only minor help (autocomplete, grammar)', short: 'Minor help only', icon: 'pencil' },
};

export const CATEGORY_INFO: Record<Category, string> = {
  'operating-system': 'Operating system',
  distribution: 'Linux distribution',
  language: 'Programming language',
  library: 'Library',
  framework: 'Framework',
  tool: 'Developer tool',
  application: 'Application',
  foundation: 'Foundation',
};
