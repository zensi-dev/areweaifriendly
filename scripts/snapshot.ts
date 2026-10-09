/**
 * Fetches sources into snapshots and prints the "sources" array, for entries
 * written or corrected by hand (classifiedBy: "manual").
 *
 *   bun scripts/snapshot.ts <slug> <url> [url...]
 */
import { fetchSource } from './lib/fetch';
import { toSources } from './lib/pipeline';
import { snapshotPath, today, writeSnapshot } from './lib/store';

const [slug, ...urls] = process.argv.slice(2);
if (!slug || !urls.length) throw new Error('Usage: bun scripts/snapshot.ts <slug> <url> [url...]');

const fetched = [];
for (const url of urls) {
  const f = await fetchSource(url);
  await writeSnapshot(slug, f.url, f.text);
  console.error(`${url} -> ${snapshotPath(slug, url)} (${f.text.length} chars)`);
  fetched.push(f);
}
console.log(JSON.stringify(toSources(fetched, today()), null, 2));
