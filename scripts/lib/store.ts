import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Project, type Project as ProjectT } from '../../src/lib/schema';
import { sha256 } from './fetch';

export const ROOT = join(import.meta.dir, '..', '..');
export const DATA_DIR = join(ROOT, 'data', 'projects');
export const SNAPSHOT_DIR = join(ROOT, 'snapshots');

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function projectPath(slug: string): string {
  return join(DATA_DIR, `${slug}.json`);
}

/** One plain-text file per source URL, so policy changes show up as readable git diffs. */
export function snapshotPath(slug: string, url: string): string {
  return join(SNAPSHOT_DIR, slug, `${sha256(url).slice(0, 12)}.txt`);
}

export async function listSlugs(): Promise<string[]> {
  const files = await readdir(DATA_DIR);
  return files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
}

export async function readProject(slug: string): Promise<ProjectT> {
  return Project.parse(JSON.parse(await readFile(projectPath(slug), 'utf8')));
}

export async function projectExists(slug: string): Promise<boolean> {
  return Bun.file(projectPath(slug)).exists();
}

export async function writeProject(slug: string, project: ProjectT): Promise<void> {
  const parsed = Project.parse(project);
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(projectPath(slug), `${JSON.stringify(parsed, null, 2)}\n`);
}

export async function readSnapshot(slug: string, url: string): Promise<string | null> {
  const file = Bun.file(snapshotPath(slug, url));
  return (await file.exists()) ? file.text() : null;
}

export async function writeSnapshot(slug: string, url: string, text: string): Promise<void> {
  await mkdir(join(SNAPSHOT_DIR, slug), { recursive: true });
  await writeFile(snapshotPath(slug, url), text);
}
