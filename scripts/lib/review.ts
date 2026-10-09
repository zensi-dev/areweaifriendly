import { CONDITION_INFO, DIMENSION_INFO } from '../../src/lib/labels';
import { DIMENSIONS, type DimensionPolicy } from '../../src/lib/schema';
import type { Classification } from './classify';
import { ANSWER_OPTIONS, type Submission } from './issue-form';
import { stanceLabel } from './pipeline';

/** Marks the bot's review comments, so the workflow can count them. */
export const REVIEW_MARKER = '<!-- awaf-review -->';

export type Review = {
  submission?: Submission;
  classification?: Classification;
  /** Things the submitter must fix, as Markdown; any problem means the submission is not accepted. */
  problems: string[];
  /** Things a maintainer should check in the pull request, as Markdown. */
  flags: string[];
};

/** Accepts unless a source is not the project's own policy; doubtful AI output only flags the PR. */
export function decide(submission: Submission, c: Classification): Review {
  const problems: string[] = [];
  const flags = c.warnings.map(md);
  const name = md(submission.name);
  for (const s of c.sources) {
    const note = s.note ? `: ${md(s.note)}` : '.';
    if (s.publisher === 'third-party') problems.push(`${s.url} doesn't look like it was published by ${name}${note}`);
    else if (!s.isPolicy) problems.push(`${s.url} doesn't look like a policy or contributor guide${note}`);
    else if (s.publisher === 'unclear') flags.push(`Could not tell who published ${s.url}${note}`);
  }
  if (c.confidence !== 'high') flags.push(`Confidence is ${c.confidence}.`);
  if (DIMENSIONS.every((d) => c.policy[d].verdict === 'unspecified')) {
    flags.push('The sources do not address AI in any area; this would be listed as "No policy".');
  }
  for (const dim of DIMENSIONS) {
    const answer = submission.answers[dim];
    if (answer && answer !== c.policy[dim].verdict) {
      flags.push(
        `${DIMENSION_INFO[dim].label}: the submitter said "${ANSWER_OPTIONS[answer]}", the review says "${ANSWER_OPTIONS[c.policy[dim].verdict]}".`,
      );
    }
  }
  return { submission, classification: c, problems, flags };
}

/**
 * Escapes text from the issue, the fetched pages or the model before it goes into a
 * comment: one line, no Markdown or HTML, and no @mentions that would notify people.
 */
export function md(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\`*_[\]<>|~#]/g, '\\$&')
    .replace(/@(?=\w)/g, '@​');
}

function verdictText({ verdict, conditions }: DimensionPolicy): string {
  const label = ANSWER_OPTIONS[verdict];
  return conditions.length ? `${label}: ${conditions.map((c) => CONDITION_INFO[c].label).join('; ')}` : label;
}

/** The findings shared by the issue comment and the pull request body. */
export function renderFindings(r: Review): string {
  const out: string[] = [];
  const c = r.classification;
  if (c && r.submission) {
    out.push(`**${md(r.submission.name)}** reads as **${stanceLabel(c.policy)}**.`, '', `> ${md(c.summary)}`, '');
    out.push('| Area | Review | Submitter |', '| --- | --- | --- |');
    for (const dim of DIMENSIONS) {
      const answer = r.submission.answers[dim];
      const mine = answer ? ANSWER_OPTIONS[answer] + (answer === c.policy[dim].verdict ? '' : ' (differs)') : '–';
      out.push(`| ${DIMENSION_INFO[dim].label} | ${verdictText(c.policy[dim])} | ${mine} |`);
    }
    out.push('', '**Sources**', '');
    for (const s of c.sources) {
      const publisher = { project: 'published by the project', 'third-party': '**third party**', unclear: 'publisher unclear' }[s.publisher];
      const kind = s.isPolicy ? 'policy' : '**not a policy**';
      out.push(`- ${s.url}: ${publisher}, ${kind}.${s.note ? ` ${md(s.note)}` : ''}`);
    }
    if (c.evidence.length) {
      out.push('', '**Quotes**', '');
      for (const e of c.evidence) out.push(`- ${DIMENSION_INFO[e.dimension].label}: “${md(e.quote)}” (${e.sourceUrl})`);
    }
    out.push('');
  }
  if (r.problems.length) out.push('**What to fix**', '', ...r.problems.map((p) => `- ${p}`), '');
  if (r.flags.length) out.push('**For the maintainer**', '', ...r.flags.map((f) => `- ${f}`), '');
  return out.join('\n').trim();
}

export function renderComment(r: Review, opts: { editTriggersReview: boolean }): string {
  const ok = !r.problems.length;
  const next = ok
    ? 'The data file and pull request are ready for a maintainer to check.'
    : [
        'To fix it, edit this issue (**···** menu, then **Edit**) and save. Keep the `###` headings exactly as they are.',
        opts.editTriggersReview
          ? 'The review runs again automatically after your edit.'
          : 'Edits no longer start a review automatically; a maintainer will start the next one.',
      ].join(' ');
  return [REVIEW_MARKER, `### ${ok ? 'Review passed' : 'Changes needed'}`, '', renderFindings(r), '', next].join('\n');
}

export function renderPrBody(r: Review, issueNumber?: number): string {
  return [
    renderFindings(r),
    '',
    'Classified by AI. Check the verdicts and quotes against the sources before merging.',
    ...(issueNumber ? ['', `Closes #${issueNumber}`] : []),
  ].join('\n');
}
