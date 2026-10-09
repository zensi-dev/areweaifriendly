import { execFileSync } from 'node:child_process';
import { Project, type ProjectWithSlug } from './schema';
import { deriveStance, STANCES, type Stance } from './stance';

export type SiteProject = ProjectWithSlug & { stance: Stance };

const files = import.meta.glob<{ default: unknown }>('/data/projects/*.json', { eager: true });

/** Unix time each project file was last added in git, by slug. Empty without git history. */
function addedTimes(): Map<string, number> {
  const times = new Map<string, number>();
  let log: string;
  try {
    log = execFileSync(
      'git',
      ['log', '--diff-filter=A', '--no-renames', '--format=%ct', '--name-only', '--', 'data/projects/*.json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    return times;
  }
  let time = 0;
  for (const line of log.split('\n')) {
    if (/^\d+$/.test(line)) time = Number(line);
    else if (line) {
      const slug = line.split('/').pop()!.replace(/\.json$/, '');
      // Newest commits come first, so a re-added file keeps its latest add.
      if (!times.has(slug)) times.set(slug, time);
    }
  }
  return times;
}

const added = addedTimes();

/** Newest additions first; projects added together are ordered by name. Files not yet committed count as newest. */
export const projects: SiteProject[] = Object.entries(files)
  .map(([path, mod]) => {
    const slug = path.split('/').pop()!.replace(/\.json$/, '');
    const parsed = Project.safeParse(mod.default);
    if (!parsed.success) throw new Error(`Invalid data/projects/${slug}.json: ${parsed.error.message}`);
    return { ...parsed.data, slug, stance: deriveStance(parsed.data.policy) };
  })
  .sort(
    (a, b) =>
      (added.get(b.slug) ?? Infinity) - (added.get(a.slug) ?? Infinity) ||
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
  );

export function stanceCounts(list: SiteProject[] = projects): Record<Stance, number> {
  const counts = Object.fromEntries(STANCES.map((s) => [s, 0])) as Record<Stance, number>;
  for (const p of list) counts[p.stance]++;
  return counts;
}

export function lastUpdated(list: SiteProject[] = projects): string {
  return list.reduce((max, p) => (p.classifiedAt > max ? p.classifiedAt : max), '');
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
