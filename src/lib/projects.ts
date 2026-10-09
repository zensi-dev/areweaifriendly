import { Project, type ProjectWithSlug } from './schema';
import { deriveStance, STANCES, type Stance } from './stance';

export type SiteProject = ProjectWithSlug & { stance: Stance };

const files = import.meta.glob<{ default: unknown }>('/data/projects/*.json', { eager: true });

export const projects: SiteProject[] = Object.entries(files)
  .map(([path, mod]) => {
    const slug = path.split('/').pop()!.replace(/\.json$/, '');
    const parsed = Project.safeParse(mod.default);
    if (!parsed.success) throw new Error(`Invalid data/projects/${slug}.json: ${parsed.error.message}`);
    return { ...parsed.data, slug, stance: deriveStance(parsed.data.policy) };
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

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
