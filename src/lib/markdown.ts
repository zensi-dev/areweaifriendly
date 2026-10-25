import { CATEGORY_INFO, CONDITION_INFO, DIMENSION_INFO, RULE_CONDITION_INFO, RULE_STATUS_INFO, STANCE_INFO, USE_INFO } from './labels';
import type { SiteProject } from './projects';
import { DIMENSIONS } from './schema';
import { areaStance, STANCES } from './stance';
import { SITE_URL } from '../site.config';

export const pageUrl = (slug: string) => `${SITE_URL}/projects/${slug}/`;
export const markdownUrl = (slug: string) => `${SITE_URL}/projects/${slug}.md`;

export function stanceGlossary(): string {
  return STANCES.map((s) => `- **${STANCE_INFO[s].plain}** (shown as ${STANCE_INFO[s].label}): ${STANCE_INFO[s].meaning}`).join('\n');
}

/** Plain Markdown version of a project page, for AI agents and llms-full.txt. */
export function projectMarkdown(p: SiteProject, headingLevel = 1): string {
  const h = '#'.repeat(headingLevel);
  const lines = [
    `${h} ${p.name}: ${STANCE_INFO[p.stance].plain}`,
    '',
    `> ${p.summary}`,
    '',
    `- What it is: ${p.description} (${CATEGORY_INFO[p.category]})`,
    `- Homepage: ${p.homepage}`,
    ...(p.repo ? [`- Repository: ${p.repo}`] : []),
    `- Overall stance: ${STANCE_INFO[p.stance].plain} (${STANCE_INFO[p.stance].label}). ${STANCE_INFO[p.stance].meaning}`,
    `- Last classified: ${p.classifiedAt} (${p.classifiedBy === 'manual' ? 'manual review' : 'AI'}, ${p.confidence} confidence)`,
    `- Policy last changed: ${p.lastChanged}`,
    `- Web page: ${pageUrl(p.slug)}`,
    '',
    `${h}# Policy by area`,
    '',
  ];
  for (const dim of DIMENSIONS) {
    const d = p.policy[dim];
    const conditions = d.conditions.map((c) => CONDITION_INFO[c].label).join('; ');
    lines.push(`- **${DIMENSION_INFO[dim].label}**: ${STANCE_INFO[areaStance(d)].plain}${conditions ? ` (${conditions})` : ''}`);
  }
  if (p.rules) {
    lines.push('', `${h}# What is allowed and what is not`, '');
    for (const dim of DIMENSIONS) {
      const rules = p.rules.filter((r) => USE_INFO[r.use].area === dim);
      const other = (p.otherRules ?? []).filter((o) => o.area === dim);
      lines.push(`${h}## ${DIMENSION_INFO[dim].label}`, '');
      if (!rules.length && !other.length) lines.push('Not covered by the policy.', '');
      for (const r of rules) {
        const conditions = r.conditions.map(
          (c) => `${RULE_CONDITION_INFO[c.condition].label}${c.detail ? `: ${c.detail}` : ''}${c.strength === 'recommended' ? ' (recommended)' : ''}`,
        );
        lines.push(`- **${USE_INFO[r.use].label}**: ${RULE_STATUS_INFO[r.status].label}. ${r.note}${conditions.length ? ` Conditions: ${conditions.join('; ')}.` : ''}`);
        for (const q of r.quotes) lines.push(`  > "${q.quote}" (${q.sourceUrl})`);
      }
      for (const o of other) {
        lines.push(`- **Other**: ${RULE_STATUS_INFO[o.status].label}. ${o.description}`);
        for (const q of o.quotes) lines.push(`  > "${q.quote}" (${q.sourceUrl})`);
      }
      if (rules.length || other.length) lines.push('');
    }
    const general = (p.otherRules ?? []).filter((o) => o.area === 'general');
    if (general.length) {
      lines.push(`${h}## General`, '');
      for (const o of general) lines.push(`- ${RULE_STATUS_INFO[o.status].label}: ${o.description}`);
      lines.push('');
    }
    if (lines.at(-1) === '') lines.pop();
  } else if (p.evidence.length) {
    lines.push('', `${h}# In their own words`, '');
    for (const e of p.evidence) lines.push(`- ${DIMENSION_INFO[e.dimension].label}: "${e.quote}" (${e.sourceUrl})`);
  }
  lines.push('', `${h}# Sources`, '');
  for (const s of p.sources) lines.push(`- [${s.title}](${s.url}), fetched ${s.fetchedAt}`);
  return `${lines.join('\n')}\n`;
}
