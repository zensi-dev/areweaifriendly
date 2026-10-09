# Are We AI Friendly?

Where open source projects stand on AI: AI-assisted code, AI-found issues and AI-written text. Every rating comes from the project's own published policy, with quotes.

A fully static [Astro](https://astro.build) site, served as static assets on Cloudflare Workers. There is no server code, database or API.

## How it works

```
GitHub issue ("Add a project")
  └─ maintainer adds "ready-for-review" label
       └─ intake workflow: fetch sources → AI review + classifier → quote check → comment on the issue
            ├─ passes → snapshot + data file → pull request → human review + merge
            └─ needs changes → "needs-changes" label → submitter edits the issue → review runs again
                                                                                        └─ deploy workflow → Cloudflare
weekly check workflow: re-fetch sources → unchanged text? skip : re-classify → pull request
```

- **`data/projects/<slug>.json`** is the source of truth: per-area verdicts, conditions, quotes and sources.
- **`snapshots/<slug>/*.txt`** holds the plain text of every source, so policy changes show up as git diffs. The `hash` in each source is the sha256 of its snapshot.
- **Stances are computed, never stored or picked by the model** ([`src/lib/stance.ts`](src/lib/stance.ts)). One scale, used per area and overall: Friendly, Mostly friendly, Unfriendly, plus No policy. Per area: banned or minor help only → Unfriendly; disclosure or other extra rules → Mostly friendly; allowed or only baseline rules (accountability, human review, licence) → Friendly; not addressed → No policy. Overall follows code, capped at Mostly friendly when issues or text are Unfriendly.
- **The model only fills in the schema.** It reads each source document in full, every quote it returns must appear word for word in the snapshot ([`scripts/lib/quotes.ts`](scripts/lib/quotes.ts)), and anything doubtful is listed in the PR for the reviewer.
- **Submission review** ([`scripts/lib/review.ts`](scripts/lib/review.ts)). The model also says, per source, who published it and whether it is a policy. Problems the submitter can fix (form errors, unreadable links, already tracked, third-party or non-policy sources) get a "Changes needed" comment and the `needs-changes` label. Doubts about the AI output (low confidence, unclear publisher, dropped quotes, disagreement with the submitter's own reading) still open the PR, labelled `needs-review`. The model never sees the submitter's reading, so it can't anchor on it.
- **Re-runs.** The workflow removes `ready-for-review` when it starts, so a maintainer can add it again at any time. While an issue has `needs-changes`, editing its body starts a new review on its own, up to `MAX_REVIEWS_ON_EDIT` (5) review comments per issue; after that a maintainer re-adds the label. A re-run updates the existing pull request and closes outdated ones.

## Styling

[Tailwind CSS 4](https://tailwindcss.com) through the official `@tailwindcss/vite` plugin. Typeface: [Recursive](https://www.recursive.design/), self-hosted via `@fontsource-variable/recursive` (its casual axis is used for headings via the `casual` utility).

- `src/styles/global.css` holds the design tokens in `@theme`: neutral white and grey (GitHub-style), near-black text, a blue accent for focus and hover, and one colour per mood. Tailwind's default palette is cleared, so only site colours exist (`bg-paper`, `text-muted`, `border-line`, ...). Dark mode swaps the same variables.
- Each stance is shown as a face on a square tile (`src/components/MoodTile.astro`, drawings in `src/lib/faces.ts`), both for the project and for each area. Labels: Friendly, Mostly friendly, Unfriendly, No policy; `STANCE_INFO[...].plain` keeps the literal wording ("AI-friendly with conditions") for titles, `llms.txt` and agents.
- Mood colours come from the `tone-*` utilities, which set `--tone`; components use `bg-(--tone)`. The class map lives in `src/lib/tones.ts`.
- Utilities go in the markup with Astro's `class:list`. Interactive states use built-in variants: `group-open:` and `has-open:` for rows, `aria-pressed:` for the friendliness filters, `aria-[current=page]:` for navigation. Layout is mobile-first.

## Development

Requires [Bun](https://bun.sh).

```sh
bun install
bun run dev          # local site at http://localhost:4321
bun run build        # static site in dist/
bun run preview      # serve dist/ with wrangler, like production
bun test             # unit tests
bun run typecheck
bun run validate     # schema, snapshot hashes, quotes found in snapshots
```

### Classifier settings

Any OpenAI-compatible chat completions endpoint works. Copy `.env.example` to `.env` (Bun loads it automatically):

| Variable | Meaning |
| --- | --- |
| `AI_BASE_URL` | e.g. `https://api.openai.com/v1`, `https://openrouter.ai/api/v1`, `http://localhost:11434/v1` |
| `AI_API_KEY` | API key for that endpoint |
| `AI_MODEL` | model name |
| `AI_RESPONSE_FORMAT` | `json_schema` (default, strict structured output) or `json_object` for providers without schema support |
| `AI_MAX_INPUT_CHARS` | safety cap on text sent per project (default 300000); truncation is flagged for review |

```sh
bun scripts/intake.ts --body-file issue.md   # review an issue-form body; writes review-comment.md (and pr-body.md if it passes)
bun scripts/check.ts                          # check all sources (only calls the model if text changed)
bun scripts/check.ts --force curl             # re-classify one project
bun scripts/snapshot.ts <slug> <url>...       # snapshot sources for a hand-written entry
```

Hand-written entries use `"classifiedBy": "manual"`; classified ones use `"ai"`. Run `bun run validate` before committing.

## Setup checklist

**Cloudflare**
1. Create an account API token (*Manage Account → Account API Tokens*) with Account: *Workers Scripts* Edit and *Account Settings* Read for the account, and Zone: *Workers Routes* Edit, *Zone* Read and *DNS* Edit for the site's zone.
2. Add GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Add the domain as a zone in the same account. `routes` in `wrangler.jsonc` attaches it to the Worker as a custom domain on deploy.
4. Keep AI crawlers allowed: in the zone's *Security → Bots* settings, leave "Block AI bots" and the managed `robots.txt` off. Being readable by agents is the point of `llms.txt`.

**GitHub**
1. Settings → Actions → General: allow GitHub Actions to create pull requests.
2. Secrets: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` (optional `AI_RESPONSE_FORMAT`). Optional variable: `AI_MAX_INPUT_CHARS`. The provider settings are secrets so the public Actions logs never show which AI provider is used; GitHub masks secret values in logs. For the same reason classifier errors leave out the URL, host and provider response, and data files record `"classifiedBy": "ai"` rather than the model name.
3. Labels: `submission`, `ready-for-review`, `correction` (`needs-changes` and `needs-review` are created automatically). Issue forms skip labels that don't exist yet.
4. Pull requests opened by the workflows use `GITHUB_TOKEN`, so they don't trigger the Validate workflow. The intake workflow validates and builds before opening its PR, and the deploy workflow validates again before deploying, so invalid data never ships.

## For AI agents

`/llms.txt`, `/llms-full.txt`, `/projects.json`, and `/projects/<slug>.md` for each project.
