/**
 * Re-fetches every policy source. Unchanged text is skipped without calling
 * the model; changed text is re-classified and written back for review.
 *
 *   bun scripts/check.ts                 check all projects
 *   bun scripts/check.ts curl qemu       check some projects
 *   bun scripts/check.ts --force curl    re-classify even if nothing changed
 *   bun scripts/check.ts --concurrency 4 check at most 4 projects at a time (default $CHECK_CONCURRENCY or 16)
 *
 * Projects are checked in parallel; the report lists them in slug order once all are done.
 * Writes a Markdown report to $CHECK_REPORT (default: check-report.md).
 */
import { writeFile } from 'node:fs/promises';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { classify, configFromEnv, RUBRIC_VERSION, type ClassifierConfig } from './lib/classify';
import { fetchSource, type FetchedSource } from './lib/fetch';
import { areaChanges, mapLimit, reviewNotes, ruleChanges, setOutputs, stanceLabel, toSources } from './lib/pipeline';
import { listSlugs, readProject, today, writeProject, writeSnapshot } from './lib/store';

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

/** Checks one project; returns its report section (if re-classified) and any problems. */
async function check(slug: string): Promise<{ changed?: string; problems: string[] }> {
  const project = await readProject(slug);
  const problems: string[] = [];
  const results = await Promise.allSettled(project.sources.map((source) => fetchSource(source.url)));
  const fetched: FetchedSource[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') fetched.push(r.value);
    else problems.push(`- **${project.name}**: ${(r.reason as Error).message}`);
  }
  if (problems.length) return { problems };

  const textChanged = fetched.some((f, i) => f.hash !== project.sources[i].hash);
  if (!textChanged && !values.force) {
    console.log(`${slug}: unchanged`);
    return { problems };
  }

  let result;
  try {
    result = await classify(getConfig(), project, fetched);
  } catch (err) {
    return { problems: [`- **${project.name}**: classification failed: ${(err as Error).message}`] };
  }

  const changes = ruleChanges(project.rules, result.rules);
  const ratingChanged = !isDeepStrictEqual(result.policy, project.policy);
  const verdictChanged = ratingChanged || changes.length > 0;
  for (const f of fetched) await writeSnapshot(slug, f.url, f.text);
  await writeProject(slug, {
    ...project,
    summary: result.summary,
    policy: result.policy,
    evidence: result.evidence,
    rules: result.rules,
    otherRules: result.otherRules,
    referencedPolicies: result.referencedPolicies,
    rubricVersion: RUBRIC_VERSION,
    sources: toSources(fetched, date).map((s, i) =>
      fetched[i].hash === project.sources[i].hash ? project.sources[i] : s,
    ),
    confidence: result.confidence,
    classifiedBy: 'ai',
    classifiedAt: date,
    lastChanged: verdictChanged ? date : project.lastChanged,
  });

  const before = stanceLabel(project.policy);
  const after = stanceLabel(result.policy);
  const headline = ratingChanged
    ? before === after
      ? `Area ratings changed, overall rating unchanged (${after})`
      : `Rating changed (${before} → ${after})`
    : verdictChanged
      ? `Rules changed, ratings unchanged (${after})`
      : textChanged
        ? `Policy text changed, rules unchanged (${after})`
        : `Re-classified, rules unchanged (${after})`;
  const details = [
    ...changes.map((c) => `- ${c}`),
    ...(ratingChanged ? areaChanges(project.policy, result.policy).map((c) => `- ${c}`) : []),
  ];
  console.log(`${slug}: ${headline}`);
  return {
    changed: `### ${project.name}\n\n${headline}\n\n${details.length ? `${details.join('\n')}\n\n` : ''}${reviewNotes(result)}`,
    problems,
  };
}

const outcomes = await mapLimit(slugs, concurrency, check);
const changed = outcomes.flatMap((o) => (o.changed ? [o.changed] : []));
const problems = outcomes.flatMap((o) => o.problems);

const report = [
  changed.length ? `## Updated projects\n\n${changed.join('\n\n')}` : 'No policy changes.',
  ...(problems.length ? [`## Problems\n\n${problems.join('\n')}`] : []),
  ...(changed.length ? ['Review each change against its snapshot diff before merging.'] : []),
].join('\n\n');
await writeFile(process.env.CHECK_REPORT ?? 'check-report.md', `${report}\n`);
await setOutputs({ changed: String(changed.length > 0), problems: String(problems.length > 0) });
if (problems.length) console.error(problems.join('\n'));
