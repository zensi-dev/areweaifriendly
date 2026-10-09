import type { APIRoute, GetStaticPaths } from 'astro';
import { projectMarkdown } from '../../lib/markdown';
import { projects, type SiteProject } from '../../lib/projects';

export const getStaticPaths: GetStaticPaths = () =>
  projects.map((project) => ({ params: { slug: project.slug }, props: { project } }));

export const GET: APIRoute = ({ props }) =>
  new Response(projectMarkdown((props as { project: SiteProject }).project), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
