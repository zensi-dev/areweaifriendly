/**
 * Re-fetches every policy source. Unchanged text is skipped without calling the model; changed
 * text is re-classified with the previous review and a diff of the change as reference.
 *
 *   bun scripts/check.ts                 check all projects
 *   bun scripts/check.ts curl qemu       check some projects
 *   bun scripts/check.ts --force curl    re-classify even if nothing changed
 *   bun scripts/check.ts --concurrency 4 check at most 4 projects at a time (default $CHECK_CONCURRENCY or 16)
 *
 * Only projects whose rules, ratings or referenced documents changed need review. Projects whose text
 * changed without that are written too, but only matter when a pull request goes out anyway.
 *
 * Writes a Markdown report to $CHECK_REPORT (default: check-report.md) and, for problems a person
 * must fix (a source that is gone), a list to $CHECK_ISSUE (default: check-issue.md). Outputs for
 * the workflow: `changed` (something needs review), `problems` (anything failed) and `attention`
 * (something failed that retrying will not fix).
 */
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { classify, configFromEnv, type ClassifierConfig, type PreviousReview } from './lib/classify';
import { lineDiff } from './lib/diff';
import { fetchSource, HttpError, type FetchedSource } from './lib/fetch';
import { mapLimit, mergeClassification, reviewNotes, setOutputs, stanceLabel } from './lib/pipeline';
import { listSlugs, readProject, readSnapshot, today, writeProject, writeSnapshot } from './lib/store';

const { values, positionals } = parseArgs({
  options: { force: { type: 'boolean', default: false }, concurrency: { type: 'string', default: process.env.CHECK_CONCURRENCY || '16' } },
  allowPositionals: true,
});
const slugs = positionals.length ? positionals : await listSlugs();
const concurrency = Number(values.concurrency);
if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('--concurrency must be a positive whole number');

let config: ClassifierConfig | undefined;
const getConfig = () => (config ??= configFromEnv());

const date = today();

type Problem = { text: string; actionable: boolean };
type Outcome = { review?: string; refreshed?: string; problems: Problem[] };

/** Gone, moved to nowhere or not a page any more: a person has to update the source. Anything else may pass. */
function needsPerson(err: unknown): boolean {
  if (err instanceof HttpError) return [401, 403, 404, 410, 451].includes(err.status);
  return /^(No readable text|Too many redirects|Not a public address|Not an http)/.test((err as Error).message);
}

/** Servers fail now and then; three tries a few seconds apart ride out most of it. */
async function fetchWithRetry(url: string): Promise<FetchedSource> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchSource(url);
    } catch (err) {
      if (attempt >= 3) throw err;
      await Bun.sleep(attempt * 5_000);
    }
  }
}

async function previousReview(slug: string, project: Awaited<ReturnType<typeof readProject>>, fetched: FetchedSource[]): Promise<PreviousReview> {
  const changes: Record<string, string> = {};
  for (const f of fetched) {
    const old = await readSnapshot(slug, f.url);
    if (old !== null && project.sources.some((s) => s.url === f.url)) changes[f.url] = old === f.text ? '' : lineDiff(old, f.text);
  }
  return {
    reviewedBy: project.classifiedBy,
    date: project.classifiedAt,
    summary: project.summary,
    rules: project.rules,
    otherRules: project.otherRules,
    referencedPolicies: project.referencedPolicies,
    policy: project.policy,
    changes,
  };
}

/** Checks one project; returns its report section (if it needs review) and any problems. */
async function check(slug: string): Promise<Outcome> {
  const project = await readProject(slug);
  const results = await Promise.allSettled(project.sources.map((source) => fetchWithRetry(source.url)));
  const problems: Problem[] = [];
  const fetched: FetchedSource[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') fetched.push(r.value);
    else problems.push({ text: `**${project.name}**: ${(r.reason as Error).message}`, actionable: needsPerson(r.reason) });
  }
  if (problems.length) return { problems };

  const textChanged = fetched.some((f, i) => f.hash !== project.sources[i]!.hash);
  if (!textChanged && !values.force) {
    console.log(`${slug}: unchanged`);
    return { problems };
  }

  let result;
  try {
    result = await classify(getConfig(), project, fetched, fetch, await previousReview(slug, project, fetched));
  } catch (err) {
    return { problems: [{ text: `**${project.name}**: classification failed: ${(err as Error).message}`, actionable: false }] };
  }

  const merged = mergeClassification(project, result, fetched, date);
  for (const f of fetched) await writeSnapshot(slug, f.url, f.text);
  await writeProject(slug, merged.project);
  if (!merged.needsReview) {
    console.log(`${slug}: text changed, rules unchanged`);
    return { refreshed: project.name, problems };
  }

  const before = stanceLabel(project.policy);
  const after = stanceLabel(merged.project.policy);
  const headline = merged.areaChanges.length
    ? before === after
      ? `Area ratings changed, overall rating unchanged (${after})`
      : `Rating changed (${before} → ${after})`
    : merged.ruleChanges.length
      ? `Rules changed, ratings unchanged (${after})`
      : `Other rules or referenced documents changed (${after})`;
  const details = [...merged.ruleChanges, ...merged.areaChanges].map((c) => `- ${c}`);
  const notes = result.changeNotes.length ? `**Why, according to the classifier:**\n${result.changeNotes.map((n) => `- ${n}`).join('\n')}\n\n` : '';
  // Older entries without rules are all marked manual; "First detailed rule list" already says what happens to them.
  const manual = project.classifiedBy === 'manual' && project.rules ? '**This changes rules a maintainer reviewed by hand.**\n\n' : '';
  console.log(`${slug}: ${headline}`);
  return {
    review: `### ${project.name}\n\n${headline}\n\n${manual}${details.length ? `${details.join('\n')}\n\n` : ''}${notes}${reviewNotes(result)}`,
    problems,
  };
}

const outcomes = await mapLimit(slugs, concurrency, check);
const reviews = outcomes.flatMap((o) => (o.review ? [o.review] : []));
const refreshed = outcomes.flatMap((o) => (o.refreshed ? [o.refreshed] : []));
const problems = outcomes.flatMap((o) => o.problems);
const actionable = problems.filter((p) => p.actionable);
const transient = problems.filter((p) => !p.actionable);

const report = [
  reviews.length ? `## Needs review\n\n${reviews.join('\n\n')}` : 'Nothing needs review.',
  ...(refreshed.length
    ? [`## Text changed, rules unchanged\n\nThe classifier found the same rules, so only the snapshots are updated: ${refreshed.join(', ')}.`]
    : []),
  ...(actionable.length ? [`## Sources that need a person\n\n${actionable.map((p) => `- ${p.text}`).join('\n')}`] : []),
  ...(transient.length ? [`## Failed this time\n\nRetried next week:\n\n${transient.map((p) => `- ${p.text}`).join('\n')}`] : []),
  ...(reviews.length ? ['Review each change against its snapshot diff before merging.'] : []),
].join('\n\n');
await writeFile(process.env.CHECK_REPORT ?? 'check-report.md', `${report}\n`);
await writeFile(
  process.env.CHECK_ISSUE ?? 'check-issue.md',
  `The weekly policy check (${date}) could not read these sources, even after retrying. Update the source URLs in \`data/projects/\`; this issue closes on its own once every source reads fine.\n\n${actionable.map((p) => `- ${p.text}`).join('\n')}\n`,
);
await setOutputs({
  changed: String(reviews.length > 0),
  problems: String(problems.length > 0),
  attention: String(actionable.length > 0),
});
if (problems.length) console.error(problems.map((p) => p.text).join('\n'));
