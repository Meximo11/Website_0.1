# BrainDump

**Write first. Organize later.**

BrainDump is a local-first concept for a visual operating system for thoughts. Instead of forcing structure during capture, the app starts with a living knowledge graph and turns unstructured notes into connected thoughts, projects, and next actions.

## What is implemented

The current V1 prototype is a zero-build static app that runs directly in the browser:

- interactive neural brain map with animated connections and particles
- a living **3D neural brain** at the centre of the map (Three.js): two wrinkled hemispheres, cerebellum and stem built from ~2,500 glowing neurons, synapse links and travelling signals; it breathes, follows the pointer, pulses in the colour of the thought you select and bursts when a new thought enters
- **graceful fallbacks** for the brain: a software-projected Canvas 2D version when WebGL or the CDN is unavailable, and a pure CSS core when even canvas is missing
- **GSAP motion layer**: staged entrance (sidebar → map → lines drawing in → nodes popping → composer → panel), animated counters, node and panel pulses on selection, smooth zoom tweens, modal choreography, and a gentle shake when you try to send an empty dump — everything degrades to plain CSS transitions if GSAP is not loaded and respects `prefers-reduced-motion`
- core spaces for School, Coding, Personal, and Ideas
- selectable thoughts with a detail panel, progress, tasks, notes, deadlines, and connections
- brain dump composer with sentence-based thought counting
- local thought count persistence through `localStorage`
- search with `⌘ K`, zoom controls, mouse-wheel zoom, and drag-to-explore map movement
- Neural / Clusters views, history states, active filters, and Focus mode
- “Next best move” modal to reduce decision overload
- AI suggestion preview with explicit review / ignore behavior
- responsive layout for a compact tablet / mobile view (the detail panel becomes an overlay, the composer gets its own strip below the map)
- local-storage status shown as a first-class privacy affordance

## Run locally

No build step is required. Serve the repository with any static server, for example:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

Three.js and GSAP are loaded on demand from jsDelivr (with an unpkg fallback). Without network access the app still works: the brain switches to the 2D canvas renderer and the interface simply skips the GSAP choreography.

## Files

| File | Role |
| --- | --- |
| `index.html` | markup, SVG connection lines, script loading |
| `styles.css` | the complete colour system, layout, nodes, panels, modal, toast, responsive rules |
| `app.js` | interaction layer + GSAP motion; talks to the brain via `braindump:*` DOM events |
| `brain-3d.js` | the 3D brain (Three.js), the Canvas 2D fallback and the CSS fallback switch |
| `DESIGN.md` | AI-readable design system (tokens, type, motion, do/don't) plus curated design references and open-source repos to borrow from, with a prioritised UI backlog |

### Testing the brain tiers

Append a query parameter to force a renderer:

- `?brain=webgl` — Three.js (default when WebGL is available)
- `?brain=2d` — Canvas 2D fallback
- `?brain=css` — CSS core only

The active tier is exposed as `body[data-brain-mode]` and through `window.BrainDump3D.mode`.

## Product direction

The most important product principle is **capture before organization**. AI should remain a quiet tool that suggests groups, relations, tasks, and summaries; the user always approves changes. The next product layer would add a real graph data model, IndexedDB persistence, import/export, undoable AI suggestions, and optional local inference through Ollama or LM Studio.
