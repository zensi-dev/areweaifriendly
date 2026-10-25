import type { IconName } from './icons';
import type { Category, Condition, Dimension, RuleArea, RuleConditionId, RuleStatus, Use } from './schema';
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
    meaning:
      'AI-assisted contributions are accepted with extra rules, such as disclosing AI use or using AI only for some kinds of work, or AI is banned for issues or written text.',
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
  'limited-scope': { label: 'AI only for some kinds or sizes of work', short: 'Limited scope', icon: 'ruler' },
};

/**
 * Every use of AI we record for a project. `meaning` is also the definition the classifier
 * works from, so it must say exactly what is in and out.
 */
export const USE_INFO: Record<Use, { area: Dimension; label: string; meaning: string }> = {
  'code-completion': {
    area: 'contributions',
    label: 'Autocomplete',
    meaning: 'Inline code completion that finishes a line or short snippet the person is typing.',
  },
  'code-small': {
    area: 'contributions',
    label: 'Small fixes',
    meaning: 'AI writes small or targeted code changes, such as a typo fix or a small bug fix.',
  },
  'code-large': {
    area: 'contributions',
    label: 'Large or generated changes',
    meaning: 'AI writes substantial code: new features, large pull requests, or changes that are mostly generated.',
  },
  'code-mechanical': {
    area: 'contributions',
    label: 'Mechanical changes',
    meaning: 'AI makes repetitive edits across the code, such as renames, adding a decorator everywhere, or reformatting.',
  },
  'code-tests': { area: 'contributions', label: 'Tests', meaning: 'AI writes tests or benchmarks.' },
  'code-infra': {
    area: 'contributions',
    label: 'Build and CI',
    meaning: 'AI writes build scripts, CI configuration, packaging or other infrastructure code.',
  },
  'docs-writing': {
    area: 'contributions',
    label: 'Documentation',
    meaning: 'AI writes documentation, guides, examples text or release notes that are submitted as changes.',
  },
  localization: {
    area: 'contributions',
    label: 'Translating the software',
    meaning: 'AI or machine translation of the project\'s own interface strings or documentation into other languages.',
  },
  assets: {
    area: 'contributions',
    label: 'Images and media',
    meaning: 'AI-generated or AI-modified images, icons, artwork, audio, video or 3D models.',
  },
  research: {
    area: 'contributions',
    label: 'Research and learning',
    meaning: 'Using AI to learn, look things up, explore or explain the code base, without submitting what the AI wrote.',
  },
  'self-review': {
    area: 'contributions',
    label: 'Checking own work',
    meaning: 'Using AI to review, lint or analyze one\'s own changes before submitting them.',
  },
  'ai-authorship': {
    area: 'contributions',
    label: 'AI as author',
    meaning: 'Naming an AI tool as commit author or in a Co-authored-by trailer.',
  },
  'agent-contributions': {
    area: 'contributions',
    label: 'Autonomous agents',
    meaning: 'AI agents or bots opening pull requests, pushing commits or making changes without a person directing and checking each step.',
  },
  'issue-finding': {
    area: 'issues',
    label: 'Finding bugs with AI',
    meaning: 'Using AI tools to find bugs or vulnerabilities, then reporting them.',
  },
  'issue-writing': {
    area: 'issues',
    label: 'AI-written reports',
    meaning: 'AI writes the text of bug reports, feature requests or other issues.',
  },
  'security-report': {
    area: 'issues',
    label: 'Security reports',
    meaning: 'Security or vulnerability reports that were found or written with AI. Use this only when the policy treats security reports separately.',
  },
  'agent-issues': {
    area: 'issues',
    label: 'Bots filing issues',
    meaning: 'AI agents or bots opening issues or reports on their own.',
  },
  'pr-description': {
    area: 'summaries',
    label: 'Pull request descriptions',
    meaning: 'AI writes pull request or merge request descriptions.',
  },
  'commit-message': { area: 'summaries', label: 'Commit messages', meaning: 'AI writes commit messages.' },
  comments: {
    area: 'summaries',
    label: 'Comments',
    meaning: 'AI writes comments or replies on issues and pull requests.',
  },
  'review-answers': {
    area: 'summaries',
    label: 'Answering reviewers',
    meaning: 'AI writes answers to questions from maintainers or reviewers about one\'s own work.',
  },
  'code-review-others': {
    area: 'summaries',
    label: 'Reviewing others\' work',
    meaning: 'AI-generated reviews of other people\'s pull requests or patches.',
  },
  posts: {
    area: 'summaries',
    label: 'Forum and list posts',
    meaning: 'AI writes posts on forums, mailing lists, chat or blogs of the project.',
  },
  translation: {
    area: 'summaries',
    label: 'Translating own text',
    meaning: 'AI translates text the person wrote themselves, such as an issue or comment, into English or another language.',
  },
  proofreading: {
    area: 'summaries',
    label: 'Proofreading',
    meaning: 'AI fixes spelling, grammar or clarity of text the person wrote themselves.',
  },
  'quoting-ai': {
    area: 'summaries',
    label: 'Quoting AI output',
    meaning: 'Including AI output as a marked quote inside one\'s own message.',
  },
  'thread-summaries': {
    area: 'summaries',
    label: 'Summarizing discussions',
    meaning: 'AI summaries of issue threads, discussions or mailing list threads.',
  },
  'agent-comments': {
    area: 'summaries',
    label: 'Bots posting',
    meaning: 'AI agents or bots posting comments, replies, reviews or triage messages on someone\'s behalf.',
  },
};

export const RULE_STATUS_INFO: Record<RuleStatus, { label: string; icon: IconName; meaning: string }> = {
  allowed: { label: 'Allowed', icon: 'check', meaning: 'Permitted, with no requirement specific to AI.' },
  conditional: { label: 'Allowed with conditions', icon: 'check', meaning: 'Permitted only if AI-specific requirements are met.' },
  discouraged: { label: 'Discouraged', icon: 'alert', meaning: 'Advised against, but not forbidden.' },
  'not-allowed': { label: 'Not allowed', icon: 'x', meaning: 'Forbidden.' },
};

export const RULE_CONDITION_INFO: Record<RuleConditionId, { label: string; icon: IconName; meaning: string }> = {
  disclosure: { label: 'Disclose AI use', icon: 'tag', meaning: 'AI use must be disclosed, declared or tagged.' },
  'human-accountable': {
    label: 'Take full responsibility',
    icon: 'user-check',
    meaning: 'The person stays responsible for the work and can explain or defend it without AI.',
  },
  'human-reviewed': {
    label: 'Review AI output first',
    icon: 'eye',
    meaning: 'A person must review, verify or test the AI output before submitting it.',
  },
  'license-compliance': {
    label: 'License-safe output',
    icon: 'scale',
    meaning: 'AI output must meet licensing, copyright or Developer Certificate of Origin rules.',
  },
  'no-autonomous-agents': {
    label: 'A person must drive',
    icon: 'bot-off',
    meaning: 'Only with a person directing the tool; no autonomous agents.',
  },
  'prior-approval': {
    label: 'Ask maintainers first',
    icon: 'message',
    meaning: 'Discuss with or get agreement from maintainers before doing the AI-assisted work.',
  },
  'size-limit': { label: 'Keep it small', icon: 'ruler', meaning: 'Only small or easily reviewable amounts.' },
  'include-original': {
    label: 'Include the original',
    icon: 'languages',
    meaning: 'Translated text must come with the original text.',
  },
  'mark-quotes': { label: 'Mark AI text', icon: 'quote', meaning: 'Quoted AI output must be clearly marked as such.' },
};

export const RULE_AREA_LABEL: Record<RuleArea, string> = {
  contributions: 'Code contributions',
  issues: 'Issues & bug reports',
  summaries: 'AI-written text',
  general: 'General',
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
