/**
 * Reviews an "Add a project" issue. If it passes, writes the data file and
 * snapshots; either way, writes a review comment for the issue.
 *
 *   In Actions:  reads the issue from $GITHUB_EVENT_PATH
 *   Locally:     bun scripts/intake.ts --body-file issue.md
 *
 * Writes the comment to $COMMENT_FILE (default: review-comment.md) and, when the
 * review passes, the pull request body to $PR_BODY_FILE (default: pr-body.md).
 * Sets the outputs decision (accept or reject), slug and needs_review.
 *
 * $PREVIOUS_REVIEWS and $MAX_REVIEWS_ON_EDIT tell the comment whether the next
 * edit will start another review on its own.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { slugify, SLUG_RE } from '../src/lib/schema';
import { classify, configFromEnv } from './lib/classify';
import { fetchSource, type FetchedSource } from './lib/fetch';
import { parseSubmission, SubmissionError, type Submission } from './lib/issue-form';
import { setOutputs, toSources } from './lib/pipeline';
import { decide, md, renderComment, renderPrBody, type Review } from './lib/review';
import { projectExists, today, writeProject, writeSnapshot } from './lib/store';

const { values } = parseArgs({ options: { 'body-file': { type: 'string' } } });

let body: string;
let issueNumber: number | undefined;
if (values['body-file']) {
  body = await readFile(values['body-file'], 'utf8');
} else if (process.env.GITHUB_EVENT_PATH) {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  body = event.issue?.body ?? '';
  issueNumber = event.issue?.number;
} else {
  throw new Error('Pass --body-file or run inside a GitHub issue event');
}

const previousReviews = Number(process.env.PREVIOUS_REVIEWS) || 0;
const maxReviewsOnEdit = Number(process.env.MAX_REVIEWS_ON_EDIT) || 5;

async function finish(review: Review, slug?: string, prBody?: string): Promise<void> {
  const editTriggersReview = previousReviews + 1 < maxReviewsOnEdit;
  await writeFile(process.env.COMMENT_FILE ?? 'review-comment.md', `${renderComment(review, { editTriggersReview })}\n`);
  if (prBody) await writeFile(process.env.PR_BODY_FILE ?? 'pr-body.md', `${prBody}\n`);
  const accepted = !review.problems.length;
  await setOutputs({
    decision: accepted ? 'accept' : 'reject',
    slug: slug ?? '',
    needs_review: String(review.flags.length > 0),
  });
  console.log(accepted ? `Accepted: wrote data/projects/${slug}.json` : `Changes needed:\n${review.problems.join('\n')}`);
}

/** Problems found before the model is called; the submitter has to fix these. */
async function precheck(): Promise<{ problems: string[]; submission?: Submission; slug?: string; fetched?: FetchedSource[] }> {
  let submission: Submission;
  try {
    submission = parseSubmission(body);
  } catch (err) {
    if (err instanceof SubmissionError) return { problems: err.problems.map(md) };
    throw err;
  }
  const slug = slugify(submission.name);
  if (!SLUG_RE.test(slug)) return { problems: [`Could not make a URL slug from the project name "${md(submission.name)}".`] };
  if (await projectExists(slug)) {
    return { problems: [`${md(submission.name)} is already tracked. Please open a "Suggest a correction" issue instead.`] };
  }
  const results = await Promise.allSettled(submission.sources.map((url) => fetchSource(url)));
  const problems = results.flatMap((r, i) =>
    r.status === 'rejected' ? [`Could not read ${submission.sources[i]}: ${md((r.reason as Error).message)}`] : [],
  );
  const fetched = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  return { problems, submission, slug, fetched };
}

const pre = await precheck();
if (pre.problems.length) {
  await finish({ submission: pre.submission, problems: pre.problems, flags: [] });
} else {
  const { submission, slug, fetched } = pre as Required<typeof pre>;
  const config = configFromEnv();
  const result = await classify(config, submission, fetched);
  const review = decide(submission, result);
  if (review.problems.length) {
    await finish(review);
  } else {
    const date = today();
    for (const f of fetched) await writeSnapshot(slug, f.url, f.text);
    await writeProject(slug, {
      name: submission.name,
      description: submission.description,
      category: submission.category,
      homepage: submission.homepage,
      ...(submission.repo ? { repo: submission.repo } : {}),
      summary: result.summary,
      policy: result.policy,
      evidence: result.evidence,
      sources: toSources(fetched, date),
      confidence: result.confidence,
      classifiedBy: 'ai',
      classifiedAt: date,
      lastChanged: date,
    });
    await finish(review, slug, renderPrBody(review, issueNumber));
  }
}
