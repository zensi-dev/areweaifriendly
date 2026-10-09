/**
 * Reviews an "Add a project" issue. A research agent looks for the project's policy
 * pages, starting from the submitted links and the notes and comments on the issue;
 * the classifier then rates them. If the review passes, writes the data file and
 * snapshots; either way, writes a review comment for the issue.
 *
 *   In Actions:  reads the issue from $GITHUB_EVENT_PATH and its comments from the GitHub API
 *   Locally:     bun scripts/intake.ts --issue 3 [--repo owner/name]   (default repo: $GH_REPO)
 *                bun scripts/intake.ts --body-file issue.md              (no comments)
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
import { fetchPage } from './lib/fetch';
import { FIELDS, issueHints, parseSubmission, SubmissionError, type IssueComment, type Submission } from './lib/issue-form';
import { setOutputs, toSources } from './lib/pipeline';
import { research, type Page } from './lib/research';
import { decide, md, renderComment, renderPrBody, type Review } from './lib/review';
import { projectExists, today, writeProject, writeSnapshot } from './lib/store';

const { values } = parseArgs({
  options: { 'body-file': { type: 'string' }, issue: { type: 'string' }, repo: { type: 'string' } },
});
const repo = values.repo ?? process.env.GH_REPO;

async function github<T>(path: string): Promise<T> {
  const token = process.env.GH_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    headers: { accept: 'application/vnd.github+json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`GitHub API returned HTTP ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

type Issue = { number: number; body?: string | null; user?: { login?: string } | null };
let issue: Issue | undefined;
let body: string;
if (values['body-file']) {
  body = await readFile(values['body-file'], 'utf8');
} else if (values.issue) {
  if (!repo) throw new Error('Pass --repo owner/name or set GH_REPO');
  issue = await github<Issue>(`issues/${Number(values.issue)}`);
  body = issue.body ?? '';
} else if (process.env.GITHUB_EVENT_PATH) {
  issue = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')).issue;
  body = issue?.body ?? '';
} else {
  throw new Error('Pass --body-file or --issue, or run inside a GitHub issue event');
}
const issueNumber = issue?.number;

/** Comments in posting order; an issue with more than 500 is not a submission worth reading. */
async function loadComments(): Promise<IssueComment[]> {
  if (!issueNumber || !repo) return [];
  const all: IssueComment[] = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await github<IssueComment[]>(`issues/${issueNumber}/comments?per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
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
async function precheck(): Promise<{ problems: string[]; submission?: Submission; slug?: string; fetched?: Page[] }> {
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
  const results = await Promise.allSettled(submission.sources.map((url) => fetchPage(url)));
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
  const { submission, slug, fetched: submitted } = pre as Required<typeof pre>;
  const config = configFromEnv();
  const hints = issueHints(submission, issue?.user?.login ?? '', await loadComments());
  const researched = await research(config, { project: submission, submitted, hints, date: today() });
  console.log(`Research:\n${researched.steps.map((s) => `  ${s}`).join('\n')}`);
  const flags = researched.warnings.map(md);
  // Pages the agent picked without a person pointing at them; the classifier's publisher check decides if they stay.
  const byAgent = researched.found.filter((p) => !researched.provided.has(p.source.url));
  for (const p of byAgent.filter((p) => !p.linked)) {
    flags.push(`${p.source.url} was found by search and is not linked from the project's own pages; check that it is official. The review's reason: ${md(p.why)}`);
  }
  let fetched = [...submitted.map((p) => p.source), ...researched.found.map((p) => p.source)];
  let result = fetched.length ? await classify(config, submission, fetched) : undefined;
  const invalid = (result?.sources ?? []).filter(
    (s) => byAgent.some((p) => p.source.url === s.url) && (s.publisher === 'third-party' || !s.isPolicy),
  );
  if (invalid.length) {
    // Rate again without them, so nothing on the site comes from a page that is not the project's own policy.
    for (const s of invalid) flags.push(`Left out ${s.url}, which the review found: ${s.publisher === 'third-party' ? 'not published by the project' : 'not a policy'}. ${md(s.note)}`);
    fetched = fetched.filter((f) => !invalid.some((s) => s.url === f.url));
    result = fetched.length ? await classify(config, submission, fetched) : undefined;
  }
  const findings = {
    found: byAgent.map((p) => p.source.url).filter((url) => fetched.some((f) => f.url === url)),
    notes: researched.notes,
  };
  const review: Review = result
    ? decide(submission, result, findings)
    : {
        submission,
        problems: [
          `The review could not find a published AI or contribution policy for ${md(submission.name)}. Please add links to the project's own policy pages under "${FIELDS.sources}" or in a comment.`,
        ],
        flags: [],
        research: findings,
      };
  review.flags.unshift(...flags);
  if (review.problems.length) {
    await finish(review);
  } else {
    result = review.classification!;
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
