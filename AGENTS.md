# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, Gemini CLI, Arena, ...)
working in this repository. Claude Code reads `CLAUDE.md`, which imports this file.

## Project in one paragraph

BrainDump is a local-first memory room: every memory the user writes becomes a
node anchored on a small 3D brain. It is a zero-build static prototype
(`index.html`, `styles.css`, `app.js`, `brain-3d.js`) served by any static server
(`python3 -m http.server 4173`). No bundler, no framework, no package.json. The
design system lives in `DESIGN.md`; keep it in sync with the tokens in
`styles.css` and the `PALETTE` in `brain-3d.js` when you change one of them.

## Working rules

- Keep the stack vanilla (CSS custom properties, plain JS, GSAP and Three.js from
  the CDN with graceful fallbacks). Do not introduce a build step for a fix.
- Never break the three brain tiers (WebGL, Canvas 2D, CSS core) or the
  `prefers-reduced-motion` path.
- Interface copy is English, sentence case, no em-dashes. Icons come from the
  Phosphor sprite in `index.html`, never from unicode glyphs.
- Never seed demo memories, sample nodes or fake counters. An empty store
  (and the designed empty state) is the honest default; the brain only shows
  memories the user stored. The look is warm graphite + bone + a single ember
  accent; violet/purple is banned (this was the explicit 2026-09 pivot).
- Small, reviewable commits with a body that explains why.
- Verify in a browser when you can (`playwright-cli` skill); otherwise at least run
  the app in jsdom and check that `app.js` parses.

## Skills in this repository

Skills live in `.agents/skills/<name>/SKILL.md` (the cross-agent layout). The
`skills` CLI pins sources and content hashes in `skills-lock.json`; restore or
refresh them with `npx skills experimental_install` / `npx skills update`. To
expose them to a specific tool as well (for example `.claude/skills/`), run
`npx skills add <source> --agent claude-code`.

| Skill | Source | Use it for |
| --- | --- | --- |
| `design-taste-frontend` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | anti-slop frontend work: brief inference, design dials, AI-tell bans, pre-flight check |
| `redesign-existing-projects` | Leonxlnx/taste-skill | audit-first upgrades of an existing UI without breaking functionality (used for the 2026-09 rebuild) |
| `high-end-visual-design` | Leonxlnx/taste-skill | agency-grade spacing, double-bezel surfaces, custom easing, anti-cheap defaults (drove the memory-room rebuild) |
| `minimalist-ui` | Leonxlnx/taste-skill | warm editorial monochrome, flat grids, no gradient noise |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) | Anthropic's guidance for distinctive, intentional visual design |
| `stop-slop` | [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) | strip AI writing patterns from copy, docs and commit messages |
| `3d-web-experience` | [ai4brands-design/claude-skills](https://github.com/ai4brands-design/claude-skills/blob/master/3d-web-experience/SKILL.md) | 3D stack choice, model pipeline, scroll-driven 3D, WebGL performance and the "no 3D for 3D's sake" rules (relevant whenever the brain stage grows) |
| `playwright-cli` | [@playwright/cli](https://www.npmjs.com/package/@playwright/cli) | drive a real browser: snapshots, clicks, screenshots, traces, test generation |
| `graphify` | [safishamsi/graphify](https://github.com/safishamsi/graphify) | build and query a knowledge graph of the codebase (`/graphify .`, then `graphify query ...`) |
| `last30days` | [mvanhorn/last30days-skill](https://github.com/mvanhorn/last30days-skill) | research what people said about a topic in the last 30 days (Reddit, X, YouTube, HN, web) |
| `remotion-best-practices` | [remotion-dev/skills](https://github.com/remotion-dev/skills) | router for all Remotion skills (create, markup, render, studio, captions, maps, ...) nested inside it |
| `hyperframes` | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | mandatory entry point for any video / motion-graphic request; installs creation workflows on demand |
| `hyperframes-core`, `-animation`, `-keyframes`, `-audio`, `-creative`, `-registry`, `-studio`, `-cli`, `media-use` | heygen-com/hyperframes | the HyperFrames "core set": composition contract, motion, camera moves, audio mixing, creative direction, registry blocks, Studio layout, CLI loop, media resolution |

Notes on the vendored copies:

- `remotion-best-practices` nests the eleven `remotion-*` skills; install one at the
  top level with `npx skills add remotion-dev/skills --skill remotion-create` if you
  want it as its own slash command.
- HyperFrames workflow skills (`pr-to-video`, `slideshow`, `product-launch-video`,
  ...) are not vendored; the router runs `npx hyperframes skills update <workflow>`
  when a brief needs one.
- `3d-web-experience` is vendored by hand from that blob (the source repo has no
  skills-CLI root), so it has no `skills-lock.json` entry; refresh it by re-copying
  the file.
- `last30days` ships without its 14 MB of demo media and its dev/eval scripts (the
  ones listed in the skill's own `.skillignore`). It works with web search alone
  and gets better with the optional API keys documented in its `SKILL.md`.

## Tools that need a machine-level install

These are runtimes, not prompt files, so they are installed per developer rather
than vendored. The skills above tell you when they are missing.

| Tool | Install | Why it is not in the repo |
| --- | --- | --- |
| [gstack](https://github.com/garrytan/gstack) | `git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup --team` (needs Bun) | 24 MB toolkit with its own browser binary and telemetry preamble; gstack's own team mode is "no vendored files", the `CLAUDE.md` section was generated by `gstack-team-init optional` |
| [Understand Anything](https://github.com/Egonex-AI/Understand-Anything) | Claude Code: `/plugin marketplace add Egonex-AI/Understand-Anything` then `/plugin install understand-anything`; other agents: `curl -fsSL https://raw.githubusercontent.com/Egonex-AI/Understand-Anything/main/install.sh \| bash -s codex` | the nine `/understand*` skills resolve a plugin root with a pnpm workspace (analysis packages, dashboard, subagents); the skill files alone do not run |
| graphify CLI | `uv tool install graphifyy` (or `pipx install graphifyy`) | Python package; the project skill in `.agents/skills/graphify` calls it |
| playwright-cli | `npm i -g @playwright/cli` then `playwright-cli install` | browser binaries |
| HyperFrames CLI | `npx hyperframes ...` on demand | Node package, nothing to vendor |
| Remotion | `bun create video` / `npm init video` | React video framework, only relevant if a video project is started |

## Branch

Arena sessions work on `arena/*` branches; `main` is merged through pull requests.
