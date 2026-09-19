# BrainDump

**Your memories, one node each.**

BrainDump is a local-first memory room. You write down what is worth keeping; each memory becomes a glowing node anchored to a small 3D brain. Nothing is uploaded and nothing is invented: the app ships with an empty brain on purpose. No demo data, no sample thoughts, no fake counters. The brain only shows what you typed.

## What is implemented

A zero-build static app, served straight from the repository:

- the brain is the memory list, not a decoration: **at the start there is no brain**; each memory plants one neuron into a deterministic blueprint of a brain-shaped network (oldest = seed at the core, later ones spread the silhouette), linked to the nearest earlier node, so the structure grows toward a brain as you keep it; the network breathes, spins slowly, pulses when you store something, and links carry the occasional travelling signal
- **fixed in the centre, spun by hand**: drag anywhere (mouse or finger) to rotate the brain with spring-follow and inertia; no pan, no zoom; nodes go quiet when they turn to the back and rotate into view when you pick the memory in the list
- **graceful tiers** for the brain: WebGL, then a software-projected Canvas 2D version, then a CSS aura with a ring layout, so there is never a broken state; `?brain=webgl|2d|css` forces a tier
- **capture-first composer**: one box, Enter stores, first line becomes the title, the rest the note body
- **memory list** with relative dates, live search (filters list and dims non-matching nodes), and inline empty states
- **detail panel** with inline editing (autosaved), created/updated times, two-step delete and undo from the toast
- **export / import** as plain JSON so your data is never trapped
- optional **GSAP choreography** (staggered entrance, gentle pulses) that degrades to plain CSS transitions and honours `prefers-reduced-motion`
- keyboard shortcuts: `/` search, `N` new memory, `Esc` close, `?` about
- localStorage persistence, `body[data-brain-mode]` tier reporting
- self-hosted **Fraunces / DM Sans / Space Grotesk** variable fonts, Phosphor icon sprite, favicon and Open Graph meta, skip link, accent focus rings, 44 px touch targets, forced-colors support
- responsive: three-pane desktop, drawer list and bottom-sheet panel on small screens

## Look

Warm graphite (`#14120f`), bone text, a single ember accent held back for memory
nodes, the composer button and selection. No purple gradients, no glassmorphism
confetti, no stock-hero glow. Details in [DESIGN.md](DESIGN.md).

## Run locally

No build step. Serve the repository with any static server:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

Three.js and GSAP load from jsDelivr with an unpkg fallback. Both are optional: without
network access the brain switches to the 2D tier and the interface simply skips the GSAP
choreography. Everything else, fonts and icons included, ships in the repository.

## Files

| File | Role |
| --- | --- |
| `index.html` | markup and the Phosphor icon sprite (`<symbol id="i-…">`) |
| `styles.css` | tokens and the full interface: topbar, rail, brain stage, memory nodes, composer, panel, toast, responsive rules |
| `app.js` | memory store (localStorage), rail, markers, search, panel editing, export/import; talks to the brain via `braindump:*` DOM events |
| `brain-3d.js` | the emergent memory network, drag-to-spin, the three render tiers and `BrainDump3D` (pulse/burst/focus/face/debug) |
| `favicon.svg` | the four-dot brand mark as a scalable favicon |
| `fonts/` | self-hosted Latin variable-weight subsets of Fraunces, DM Sans and Space Grotesk (woff2) plus the OFL licence |
| `DESIGN.md` | AI-readable design system (tokens, type, motion, brain palette, do/don't) plus curated references |
| `AGENTS.md` / `CLAUDE.md` | agent guidance: working rules, the skills inventory and machine-level tool installs |
| `.agents/skills/`, `skills-lock.json` | vendored agent skills (taste-skill set, frontend-design, stop-slop, playwright-cli, graphify, last30days, Remotion, HyperFrames core set) pinned by source and content hash |

### Testing the brain tiers

Append a query parameter to force a renderer:

- `?brain=webgl` — Three.js (default when WebGL is available)
- `?brain=2d` — Canvas 2D fallback
- `?brain=css` — CSS aura only

The active tier is exposed as `body[data-brain-mode]` and through `window.BrainDump3D.mode`.

## Product direction

The one product rule: **the brain only ever shows memories the user wrote**.
The next layers could add photo or voice capture per memory, mood or tag dots
(kept to semantic state), a weekly "what did you keep?" digest, IndexedDB
persistence with undo history, and optional on-device search through
Ollama or LM Studio. Whatever gets built stays seeded-empty; sample data is
the fastest way to make this look like an AI demo.
