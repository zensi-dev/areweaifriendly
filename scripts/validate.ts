/**
 * Checks every data file: schema, snapshot integrity, and that every quote
 * really appears in its source snapshot. Exits non-zero on any error.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DIMENSIONS, Project, SLUG_RE } from '../src/lib/schema';
import { deriveStance } from '../src/lib/stance';
import { sha256 } from './lib/fetch';
import { quoteAppearsIn } from './lib/quotes';
import { listSlugs, projectPath, readSnapshot, SNAPSHOT_DIR, snapshotPath } from './lib/store';

const errors: string[] = [];
const expectedSnapshots = new Set<string>();

for (const slug of await listSlugs()) {
  const err = (msg: string) => errors.push(`${slug}: ${msg}`);
  if (!SLUG_RE.test(slug)) err('file name must be a lowercase slug');

  const parsed = Project.safeParse(await Bun.file(projectPath(slug)).json());
  if (!parsed.success) {
    err(`schema: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    continue;
  }
  const project = parsed.data;

  const texts = new Map<string, string>();
  for (const source of project.sources) {
    expectedSnapshots.add(snapshotPath(slug, source.url));
    const text = await readSnapshot(slug, source.url);
    if (text === null) err(`missing snapshot for ${source.url}`);
    else if (sha256(text) !== source.hash) err(`snapshot hash mismatch for ${source.url}`);
    else texts.set(source.url, text);
  }

  for (const dim of DIMENSIONS) {
    const { verdict, conditions } = project.policy[dim];
    if (verdict === 'conditional' && !conditions.length) err(`${dim}: "conditional" needs at least one condition`);
    if (verdict !== 'conditional' && conditions.length) err(`${dim}: only "conditional" may list conditions`);
    if (verdict !== 'unspecified' && !project.evidence.some((e) => e.dimension === dim)) {
      err(`${dim}: verdict "${verdict}" needs at least one quote`);
    }
  }

  for (const e of project.evidence) {
    const text = texts.get(e.sourceUrl);
    if (!project.sources.some((s) => s.url === e.sourceUrl)) err(`quote cites unknown source ${e.sourceUrl}`);
    else if (text !== undefined && !quoteAppearsIn(e.quote, text)) {
      err(`quote not found in snapshot of ${e.sourceUrl}: "${e.quote.slice(0, 80)}"`);
    }
  }

  console.log(`${slug.padEnd(24)} ${deriveStance(project.policy)}`);
}

for (const dir of await readdir(SNAPSHOT_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  for (const file of await readdir(join(SNAPSHOT_DIR, dir.name))) {
    const path = join(SNAPSHOT_DIR, dir.name, file);
    if (!expectedSnapshots.has(path)) errors.push(`orphan snapshot: snapshots/${dir.name}/${file}`);
  }
}

if (errors.length) {
  console.error(`\n${errors.length} error(s):\n${errors.map((e) => `  ${e}`).join('\n')}`);
  process.exit(1);
}
console.log('\nAll data valid.');
