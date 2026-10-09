import { CATEGORIES, DIMENSIONS, VERDICTS, type Category, type Dimension, type Verdict } from '../../src/lib/schema';
import { CATEGORY_INFO } from '../../src/lib/labels';

/** Field labels in .github/ISSUE_TEMPLATE/add-project.yml; keep in sync. */
export const FIELDS = {
  name: 'Project name',
  description: 'What is it?',
  homepage: 'Homepage',
  repo: 'Source repository',
  category: 'Category',
  sources: 'Policy sources',
  notes: 'Anything else?',
} as const;

/** Optional dropdowns where the submitter gives their own reading of the policy. */
export const ANSWER_FIELDS: Record<Dimension, string> = {
  contributions: 'Your reading: AI-assisted code',
  issues: 'Your reading: AI-found issues',
  summaries: 'Your reading: AI-written text',
};

/** What GitHub writes for an optional dropdown left empty. */
export const NO_SELECTION = 'None';

/** Dropdown options for ANSWER_FIELDS, in form order. */
export const ANSWER_OPTIONS: Record<Verdict, string> = {
  allowed: 'Allowed',
  conditional: 'Allowed with conditions',
  banned: 'Banned',
  unspecified: 'Not addressed',
};

export const MAX_SOURCES = 5;

export type Submission = {
  name: string;
  description: string;
  homepage: string;
  repo?: string;
  category: Category;
  /** Optional: the review also looks for policy pages itself. */
  sources: string[];
  /** Free text from "Anything else?"; the research agent reads it for hints. */
  notes?: string;
  /** The submitter's own verdicts; missing when they left the dropdown empty. */
  answers: Partial<Record<Dimension, Verdict>>;
};

/** Every problem found in an issue body, so the submitter can fix them all in one edit. */
export class SubmissionError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
  }
}

/**
 * GitHub renders issue forms as "### Label\n\nvalue" sections; empty text fields become
 * "_No response_", empty optional dropdowns become NO_SELECTION.
 */
export function parseSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = body.replace(/\r\n?/g, '\n').split(/^###\s+/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const label = (nl === -1 ? part : part.slice(0, nl)).trim();
    const value = nl === -1 ? '' : part.slice(nl + 1).trim();
    sections.set(label, value === '_No response_' ? '' : value);
  }
  return sections;
}

function httpUrl(value: string, field: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`"${field}" is not a valid URL: ${value}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`"${field}" must be an http(s) URL`);
  return url.toString();
}

export function parseSubmission(body: string): Submission {
  const s = parseSections(body);
  const get = (label: string) => s.get(label) ?? '';
  const problems: string[] = [];
  const check = <T>(fn: () => T): T | undefined => {
    try {
      return fn();
    } catch (err) {
      problems.push((err as Error).message);
      return undefined;
    }
  };

  const name = get(FIELDS.name).split('\n')[0].trim();
  if (!name) problems.push(`"${FIELDS.name}" is required`);
  const description = get(FIELDS.description).split('\n')[0].trim();
  if (!description) problems.push(`"${FIELDS.description}" is required`);

  const categoryLabel = get(FIELDS.category).trim();
  const category = CATEGORIES.find((c) => CATEGORY_INFO[c] === categoryLabel);
  if (!category) problems.push(`Unknown category: ${categoryLabel || '(empty)'}`);

  const sources = [
    ...new Set(
      get(FIELDS.sources)
        .split('\n')
        .map((l) => l.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean)
        .flatMap((l) => check(() => httpUrl(l, FIELDS.sources)) ?? []),
    ),
  ];
  if (sources.length > MAX_SOURCES) problems.push(`At most ${MAX_SOURCES} policy sources, please`);

  const homepage = check(() => httpUrl(get(FIELDS.homepage), FIELDS.homepage));
  const repoValue = get(FIELDS.repo).trim();
  const repo = repoValue ? check(() => httpUrl(repoValue, FIELDS.repo)) : undefined;

  const answers: Submission['answers'] = {};
  for (const dim of DIMENSIONS) {
    const value = get(ANSWER_FIELDS[dim]).trim();
    if (!value || value === NO_SELECTION) continue;
    const verdict = VERDICTS.find((v) => ANSWER_OPTIONS[v] === value);
    if (verdict) answers[dim] = verdict;
    else problems.push(`Unknown answer for "${ANSWER_FIELDS[dim]}": ${value}`);
  }

  const notes = get(FIELDS.notes).trim();

  if (problems.length) throw new SubmissionError(problems);
  return {
    name,
    description,
    homepage: homepage!,
    ...(repo ? { repo } : {}),
    category: category!,
    sources,
    ...(notes ? { notes } : {}),
    answers,
  };
}

/** Marks the bot's review comments, so the workflow can count them and the review can skip them. */
export const REVIEW_MARKER = '<!-- awaf-review -->';

/** Comment authors whose comments count as maintainer notes. */
const MAINTAINER_ASSOCIATIONS = ['OWNER', 'MEMBER', 'COLLABORATOR'];
const MAX_HINT_CHARS = 4000;

export type Hint = { author: string; role: 'submitter' | 'maintainer'; text: string };

export type IssueComment = {
  body?: string | null;
  author_association?: string;
  user?: { login?: string; type?: string } | null;
};

/**
 * Notes for the research agent: the form's "Anything else?" field and comments by the
 * submitter or a maintainer. Bot comments, including earlier reviews, are left out.
 */
export function issueHints(
  submission: Pick<Submission, 'notes'>,
  issueAuthor: string,
  comments: IssueComment[],
): Hint[] {
  const hints: Hint[] = submission.notes ? [{ author: issueAuthor, role: 'submitter', text: submission.notes }] : [];
  for (const c of comments) {
    const login = c.user?.login ?? '';
    const text = (c.body ?? '').trim();
    if (!text || !login || c.user?.type === 'Bot' || text.startsWith(REVIEW_MARKER)) continue;
    const maintainer = MAINTAINER_ASSOCIATIONS.includes(c.author_association ?? '');
    if (!maintainer && login !== issueAuthor) continue;
    hints.push({ author: login, role: maintainer ? 'maintainer' : 'submitter', text: text.slice(0, MAX_HINT_CHARS) });
  }
  return hints;
}
