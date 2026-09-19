# BrainDump — DESIGN.md

> AI-readable design system for BrainDump plus a curated list of design references
> and open-source repositories to borrow from. Format follows the DESIGN.md convention
> promoted by [styles.refero.design](https://styles.refero.design/) so any agent
> (Arena, Claude Code, Cursor, …) can pick this up in a future session.
>
> Source of truth for the values below is `styles.css` (tokens), `app.js` (motion)
> and `brain-3d.js` (the 3D brain). Keep them in sync when you change one.

---

## 1. Essence

**"Write first. Organize later."** — dark, calm, alive.

BrainDump is a *midnight observatory for thoughts*: a near-black navy void
(`#090b12`) on which a living neural brain floats in the centre, surrounded by
thought nodes connected by glowing bezier lines. Four chromatic accents — blue,
violet, orange, mint — are rationed to one job each: they colour *spaces* and
*status*, never decoration. Chrome (sidebar, topbar, detail panel) is frosted
glass with hairline borders; nothing casts a heavy shadow. Motion is the second
brand signature after the brain: everything enters in a choreographed sequence,
nodes pop with a soft back-ease, the brain breathes, pulses and bursts.

Closest published relatives (see §10): **Dala** (constellation brain on black),
**Resend** (one-violet discipline, hairline borders), **Superpower** (tight
tracking, floating pill navigation).

---

## 2. Colour palette

### Surfaces (neutrals)

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#090b12` | page canvas, stage background |
| `--bg-elevated` | `#0e1119` | sidebar / topbar base |
| `--panel` | `rgba(14,17,27,.86)` | glass panels (with `backdrop-filter: blur`) |
| `--line` | `rgba(255,255,255,.07)` | hairline borders, dividers |
| `--line-strong` | `rgba(255,255,255,.12)` | hover / focused borders |

### Text

| Token | Value | Use |
| --- | --- | --- |
| `--text` | `#eef1fa` | headings, primary copy |
| `--text-soft` | `#b6bccf` | secondary copy |
| `--muted` | `#7f879f` | labels, metadata, kickers (sentence case) |

### Accents — one job each

| Token | Value | RGB token | Job |
| --- | --- | --- | --- |
| `--blue` | `#79a9ff` | `--blue-rgb: 121,169,255` | **School** space, primary connection lines |
| `--violet` | `#b28cff` | `--violet-rgb: 178,140,255` | **Coding** space, brand mark, core brain, *active* status |
| `--orange` | `#ff9f7a` | `--orange-rgb: 255,159,122` | **Personal** space, *deadline soon* status |
| `--mint` | `#7fe3c3` | `--mint-rgb: 127,227,195` | **Ideas** space, *saved / synced* status |
| `--rose` | `#ff9b9b` | — | destructive actions only |

Glows are always `rgba(var(--x-rgb), 0.12–0.45)`; never a solid accent fill
larger than a pill button. The 3D brain reads the same palette
(`PALETTE` in `brain-3d.js`) — if you change a hex here, change it there.

---

## 3. Typography

| Role | Font | Notes |
| --- | --- | --- |
| Display / headings | **Space Grotesk** 500–700 | `h1` 30px / 600 / `-0.03em`, panel & modal titles 18–26px |
| Body / UI | **DM Sans** 400–600 | base 14px / 1.4, buttons 13px, metadata 11–12px |
| Kickers / labels | DM Sans 500–600, 11–12px, `letter-spacing: .01em`, **sentence case** | `Selected thought`, `Workspace`, `Node status` |
| Brand mark | Space Grotesk 700, 12px, `letter-spacing: .24em`, uppercase | only `MY BRAIN` under the core |
| Numbers | Space Grotesk 600–700 | stats footer 20px, brain core counter |

Scale in use: 11 · 11.5 · 12 · 13 · 14 · 15 · 16 · 18 · 20 · 22 · 24 · 26 · 30 · 44 px
(44px is reserved for the brain core icon).

Fonts are **self-hosted** (`fonts/*.woff2`, Latin variable subsets, `@font-face` at the
top of `styles.css`, `font-display: swap`, preloaded in `index.html`). No Google Fonts
`<link>`. Headings use `text-wrap: balance`, paragraphs `text-wrap: pretty`, and every
live number (`zoom-level`, counters, map status, composer counter) is `tabular-nums`.

Weights in use: 500 · 600 (default emphasis) · 700 (rare). Rule of thumb borrowed
from Dala / Superpower: create hierarchy with **scale and colour**, not with
weight 800 or capitals. Nothing heavier than 700.

### Iconography

Icons are **[Phosphor](https://phosphoricons.com)** (MIT), shipped as an inline SVG
sprite at the top of `<body>` and generated from `@phosphor-icons/core`. Use
`<svg class="icon" aria-hidden="true"><use href="#i-name"></use></svg>` in markup
or `icon('name')` in `app.js`. The `.icon` class is `1em` square and fills
`currentColor`, so size and colour come from the container (`.nav-icon` 15px,
`.node-icon` 22px, `.core-symbol` 44px, buttons 15–18px, `.checkmark` 10px).
Weights: *regular* for objects, *bold* for glyph-like marks (x, plus, check,
arrows, caret), *fill* for the sparkle / send / lightning accents. Glows use
`filter: drop-shadow(...)`, never `text-shadow`. Typographic marks (`›`, `·`, `•`)
stay text; nothing else may be a unicode glyph. Keyboard hints use the `command` and
`key-return` symbols, and `app.js` swaps the command symbol for the word "Ctrl" outside
Apple platforms (`.mod-key`).

---

## 4. Spacing & shape

| Purpose | Value |
| --- | --- |
| Base unit | 4px (most gaps are 6 · 8 · 10 · 12 · 14 · 18 · 22 · 28) |
| Sidebar width | `--sidebar-w: 248px` |
| Detail panel width | `--panel-w: 340px` |
| Density | comfortable in chrome, compact inside the detail panel |

| Radius token | Value | Used for |
| --- | --- | --- |
| `--radius-xl` | 26px | modal, composer, large glass cards |
| `--radius-lg` | 20px | panels, next-task card |
| `--radius-md` | 14px | buttons, inputs, chips |
| `--radius-sm` | 10px | small chips, kbd, counters |
| pills | 999px | status pills, nav counts, zoom control |

Nodes are circles: core 150px; space nodes have a 58px icon disc inside a 90px
halo; small nodes 46px icon / 74px halo; tiny nodes 36px icon / 58px halo.
Labels sit below the disc (`strong` 12.5–14px, `small` 10.5–11px).

---

## 5. Surfaces & elevation

- Layers are separated by **hairline borders** (`--line`) and **backdrop blur**
  (10 uses of `backdrop-filter` in `styles.css`), not by neutral drop shadows.
- Shadows are *coloured light*, not darkness: `0 8px 20px rgba(var(--blue-rgb), .25)`
  on active buttons, `0 0 8px var(--accent)` on status dots, and only the modal /
  core use a deep `0 24–40px 60–100px rgba(0,0,0,.5–.6)` plus an accent halo.
  `--shadow-soft` (`0 18px 50px rgba(0,0,0,.38)`) is the token for anything new
  that floats.
- Inset vignettes (`inset 0 0 120–160px rgba(0,0,0,.35–.6)`) give the stage and
  the focus state depth without borders.
- Stage atmosphere: two drifting radial `stage-glow` blobs (`blur(70px)`) + a
  faint 48px `map-grid` (`rgba(255,255,255,.035)`) masked to an ellipse.

---

## 6. Motion

Powered by **GSAP** (loaded from jsDelivr with SRI, unpkg fallback) and falls
back to CSS transitions. Everything respects `prefers-reduced-motion`.

| Layer | Pattern |
| --- | --- |
| Entrance | one `gsap.timeline()`: sidebar → topbar → toolbar → stage → core → lines draw in (`stroke-dashoffset`) → nodes pop from centre (`back.out(1.6)`) → composer → panel → stats. `html.is-loading` hides the first paint until staged (3 s failsafe). |
| Selection | node pulse `back.out(2)`, panel content refresh `power2.out`, brain `braindump:pulse` |
| Zoom | tween on `view.zoom`, `power2.out` 0.4 s |
| Modal | backdrop fade + card `back.out(1.5)` 0.45 s, reverse `power2.in` 0.25 s |
| New thought | node pop-in `elastic.out(1, 0.45)` + brain `braindump:burst` |
| Errors | empty-dump shake (`x: ±6`, `sine.inOut`) |

CSS durations: 0.2 s (hover) · 0.25–0.3 s (state) · 0.4 s (layout) · 0.6–0.9 s
(ambient keyframes: `floaty`, `glowDrift`, `ringPulse`, `twinkle`, `brandPulse`).
Standard curve: `--ease-out: cubic-bezier(.2,.8,.2,1)`.

> GSAP is **100 % free including all former Club plugins since 3.13 (April 2025)** —
> DrawSVG, MorphSVG, SplitText, MotionPath, Flip, Physics2D, ScrollSmoother …
> The project currently pins `gsap@3.12.5`; bumping to ≥ 3.13 unlocks these
> (see §12).

---

## 7. The brain (three tiers)

`brain-3d.js` renders a procedural brain (~2,500 seeded points: two wrinkled
hemispheres, inner neurons, cerebellum, stem) with nearest-neighbour synapses
and travelling sparks.

| Tier | `body[data-brain-mode]` | When |
| --- | --- | --- |
| WebGL (Three.js 0.160, custom point shader, additive glow sprites) | `webgl` | default |
| Canvas 2D (software projection of the same cloud) | `2d` | no WebGL / CDN blocked / context lost |
| CSS (glyph core from `styles.css`) | `css` | no canvas at all |

Force a tier with `?brain=webgl|2d|css`. `app.js` never touches Three.js — it
emits `braindump:transform | pulse | burst | focus | nudge` DOM events.

---

## 8. Layout

Three-column app shell: `sidebar (248) | main (1fr) | detail-panel (340)`.
Main = topbar → map toolbar → `brain-stage` (SVG lines + 3D layer + node layer,
legend bottom-left, composer bottom-centre) → bottom stats.

Breakpoints: 1400 (narrower panel) · 1120 (panel becomes overlay) · 820 (compact
tablet, composer gets its own strip) · 620 (mobile) · `max-height: 820` (short
laptops).

---

## 9. Do / Don't

**Do**

- keep the canvas near-black; let colour come from glows, lines and status only
- give each accent exactly one meaning (space / status); reuse, don't invent
- separate layers with hairlines + blur, not shadows
- build hierarchy with scale + colour; labels are sentence case, muted, 11–12px
- give every control a press (`scale: .97` on `:active`) and a focus ring in its own accent
- design the empty, loading and error states before the happy path (see `.map-empty`)
- edit in place (quick-add row, notes editor); never `prompt()` / `alert()` / `confirm()`
- stage every appearance (entrance timeline) and every state change (tween), and
  keep the brain in the loop through `braindump:*` events
- degrade gracefully: no GSAP → CSS transitions; no WebGL → 2D; no canvas → CSS

**Don't**

- no solid accent backgrounds larger than a pill button
- no pure white `#fff` surfaces; no light mode chrome inside the dark shell
- no weight 800/900, no more than two font families
- no motion longer than ~0.9 s outside the entrance timeline
- no new colour without adding an `--x-rgb` twin and a `PALETTE` entry in `brain-3d.js`
- no unicode glyphs as icons, no icon fonts; add a symbol to the sprite instead
- no decorative dots or pulses; a dot must mean a state (live, unread, node status)
- no tracked uppercase labels (the `MY BRAIN` mark is the single exception)
- no em-dashes in interface copy; no third-party font or icon requests

---

## 10. Design references (what to borrow)

| Reference | Why it matters for BrainDump | Borrow |
| --- | --- | --- |
| **Dala** — [styles.refero.design](https://styles.refero.design/style/e5f5f8cf-e68d-4ed1-bbf5-6b67569af648) · [dala.craftedbygc.com](https://dala.craftedbygc.com) | *"Constellation floating on black velvet"* — a particle constellation forming an **organic brain** as the single hero gesture. Practically BrainDump's twin. | multicoloured tiny triangular particles; single filled violet pill as the only strong CTA; headlines at weight 400 with `-0.04em` tracking |
| **Resend** — [styles.refero.design](https://styles.refero.design/style/0d914ef0-fa84-4c60-a9aa-cef0b5eb6e5d) | *"Black velvet with violet neon"* — hairline `#292d30` borders instead of shadows, monospace for identifiers, 150 ms ease-out hovers. | two-value radius scale (6 / 16 px), mono font for counts & shortcuts (`⌘ K`, `⌘ ↵`), ghost buttons |
| **Superpower** — [styles.refero.design](https://styles.refero.design/style/5d34568d-4bdc-445d-a527-c6f5249fa8fb) · [godly.design](https://godly.design/website/superpower) | *"Bioluminescent command centre"* — floating dark pill nav, tracking that tightens as size grows, one accent rationed to actions. | floating pill toolbar over the stage; `letter-spacing` that scales with size |
| **godly.design** — [godly.design](https://godly.design) | curated gallery; filter by *Dark* / *3D* / *Interactive*. Current picks: Superpower, Paradigm, Reevo, Taito.ai, Gitnimble. | hero motion patterns, OG-image style, logo treatments |
| **motionsites.ai** — [motionsites.ai](https://motionsites.ai) · [/backgrounds](https://motionsites.ai/backgrounds) | prompt-ready 3D / AI hero references: *Neural Pathway*, *Quantum Human*, *Obsidian*, *Agent Wave*, animated backgrounds. | ambient background loops for the stage, 3D hero staging |
| **styles.refero.design** — [gallery](https://styles.refero.design/) | 2,000+ DESIGN.md files; filter *Soft Gradients*, *Premium Design*, *High Contrast*. Related dark styles: *Unicorn Studio* (aurora behind smoked glass), *Ameba* (midnight control room), *Stargazer's dark observatory*, *Impilo* (midnight clinical observatory), *WHOOP* (performance lab at midnight). | token naming, do/don't discipline, glass + aurora recipes |

---

## 11. GitHub repositories (what to borrow)

### 3D brain, particles, shaders

| Repo | What it is | Borrow for `brain-3d.js` |
| --- | --- | --- |
| [SahilK-027/Digital-Brain](https://github.com/SahilK-027/Digital-Brain) (MIT) | Three.js + GLSL neural brain: particle system, glowing pathways, **depth-of-field / bokeh** post-processing, GSAP 3.14 camera moves. Live: digital-brain-sk.vercel.app | bokeh DOF for depth, bloom-style glow, camera choreography |
| [aamodpaudel/Brain_Lobes_Binary-ThreeJS-Inspired](https://github.com/aamodpaudel/Brain_Lobes_Binary-ThreeJS-Inspired) (MIT) | brain built from **points + custom shaders** (R3F/drei), lobe-based sections | per-lobe colouring → map *spaces* to lobes (School / Coding / Personal / Ideas) |
| [ailab-dev0/3D-Neural-Network-Visualizer](https://github.com/ailab-dev0/3D-Neural-Network-Visualizer) (MIT) | ANN/CNN/Transformer explorer: **data-flow particles**, attention beams, HDR bloom, orbit controls, Zustand | signal-particle travel along links, bloom intensity control, layer inspection UX |
| [zuck30/neural-network-studio](https://github.com/zuck30/NNStudio) | 3D neural network with live training (TF.js + Three.js) | animated weights / activations as a "thinking" state for the brain |
| [Justin0Brien/Brain](https://github.com/Justin0Brien/Brain) | modular vanilla-JS Three.js brain viewer (SceneManager / CameraController / LightingManager), GLB loading | clean module split if `brain-3d.js` grows; optional GLB mesh tier |
| [yohanchatelain/brain_render](https://github.com/yohanchatelain/brain_render) | cortical / subcortical atlas viewer, dark/light lighting presets, several camera modes | region highlighting = "focus a space" in 3D |

### Graph / mind-map UI

| Repo | What it is | Borrow for the map |
| --- | --- | --- |
| [vasturiano/three-forcegraph](https://github.com/vasturiano/three-forcegraph) · [3d-force-graph](https://github.com/vasturiano/3d-force-graph) · [r3f-forcegraph](https://github.com/vasturiano/r3f-forcegraph) | force-directed graphs as Three.js objects (d3-force-3d / ngraph), directional particles, DAG mode, click-to-expand | replace the hand-placed SVG layout with a real force layout when the data model lands; link particles |
| [0717lee/lumina-flow](https://github.com/0717lee/lumina-flow) | spatial mind map on an infinite canvas, focus mode, auto-layout, **glass-inspired dark UI**, command-style search (React Flow) | focus-mode UX, glass toolbar, command search |
| [ebuyakin/knogra](https://github.com/ebuyakin/knogra) | local-first knowledge-graph editor, one graph → many focused *scenes*, animated transitions (Cytoscape) | "scenes" = saved views of the brain; local-first persistence patterns |
| [linus-sch/Mind-Map-Wizard](https://github.com/linus-sch/Mind-Map-Wizard) | static HTML/CSS/JS AI mind-map generator, local Ollama support, SVG rendering engine, history | AI-organize flow (suggest → review → apply), Ollama BYOK, zero-build architecture like ours |
| [wisemapping/wisemapping-open-source](https://github.com/wisemapping/wisemapping-open-source) | mature SVG/React mind-mapping tool | node editing interactions, export formats |
| [MaayanLab/Knowledge-Graph-UI](https://github.com/MaayanLab/Knowledge-Graph-UI/) | Neo4j knowledge-graph frontend: neighbours, shortest paths | "connections" panel → neighbour / path queries |

### UI components & interaction

| Repo | What it is | Borrow |
| --- | --- | --- |
| [ssleptsov/ninja-keys](https://github.com/ssleptsov/ninja-keys) (via [stefanjudis/awesome-command-palette](https://github.com/stefanjudis/awesome-command-palette)) | ⌘K command palette **web component**, works with static HTML / vanilla JS, themable with CSS vars | turn the `⌘ K` search box into a real palette: jump to node, switch view, focus mode, new thought |
| [kilinkis/command-palette-micro](https://github.com/kilinkis/command-palette-micro) | Shadow-DOM encapsulated ⌘K palette, framework-agnostic | alternative if ninja-keys styling fights the theme |
| [themesberg/glass-ui](https://github.com/themesberg/glass-ui) | CSS glassmorphism library (ui.glass) | blur / border / highlight recipes for panels |
| [artyhoo/shadcn-glass-ui-library](https://github.com/artyhoo/shadcn-glass-ui-library) | 59 glass components, *Aurora* theme, 3-layer token architecture | token layering (base → semantic → component) for `styles.css` |
| [AKAspanion/ui-glassmorphism](https://github.com/AKAspanion/ui-glassmorphism) | small glass card library | reference for glass card edge highlights |

### Motion

| Resource | Borrow |
| --- | --- |
| [GSAP 3.13 release](https://gsap.com/blog/3-13/) — all plugins free | **DrawSVG** for the connection lines (replaces manual dash-offset), **MotionPath** for signal particles (replaces SMIL `animateMotion`), **SplitText** for the "My Brain" heading & modal title reveals, **Flip** for node → panel morphs, **Physics2D** for the burst |
| [greensock/GSAP](https://github.com/greensock/GSAP) | plugin sources + demos |

### DESIGN.md tooling

| Repo | Borrow |
| --- | --- |
| [rohitg00/awesome-claude-design](https://github.com/rohitg00/awesome-claude-design) | DESIGN.md prompts by aesthetic family (Linear / Stripe / Vercel …), remix recipes such as *Warp × Sentry* (mono grid + lilac → purple) |
| `npx brandmd <url>` ([yuvrajangadsingh/brandmd](https://github.com/yuvrajangadsingh/brandmd)) | extract a DESIGN.md / CSS variables from any live site (e.g. dala.craftedbygc.com) without an LLM |
| [bitjaru/styleseed](https://github.com/bitjaru/styleseed) | 69 design rules + brand skins that teach agents *how* designers decide |

---

## 12. Backlog — UI improvements derived from the references

Ordered by impact ÷ effort. Each item is self-contained and can be one commit.

1. **Bump GSAP to ≥ 3.13 and use DrawSVG + MotionPath** for the 17 connection
   lines and the 4 particles (drop SMIL `animateMotion`). *(Motion §6)*
2. **Real ⌘K command palette** (ninja-keys or hand-rolled, glass style):
   jump to any node, switch Neural/Clusters, toggle Focus, "New thought". The
   search box already advertises `⌘ K`. *(Resend / lumina-flow)*
3. **Floating pill toolbar** over the stage instead of a full-width toolbar row
   (Superpower pattern) — frees ~56 px of vertical space for the map.
4. **Mono font for numbers & shortcuts** (`JetBrains Mono` or `Commit Mono`
   fallback) on stats, counters, `kbd` — the Resend "instrumented" feel.
   (Self-host it in `fonts/` like the other two.)
5. **Bloom / DOF pass for the WebGL brain** (UnrealBloomPass + optional bokeh)
   behind a quality switch; keep additive sprites for the 2D tier.
   *(Digital-Brain, 3D-Neural-Network-Visualizer)*
6. **Lobe → space mapping**: colour the brain's regions by space and light up
   the matching lobe on selection. *(Brain_Lobes repo)*
7. **SplitText reveals** for `h1` and modal titles; **Flip** for node → panel.
8. **Force-directed layout** behind a feature flag once thoughts become data
   (three-forcegraph / d3-force), keeping the hand-tuned layout as the default.
9. **Aurora background option** ("Unicorn Studio" style) as an alternative
   stage atmosphere — slow hue-shifting radial gradients under the grid.
10. **Design tokens → JSON** (`design-tokens.json`) exported from `:root` so the
    brain palette, CSS and future components share one source.

---

## 13. Changelog (design)

- **2026-09-19, redesign pass (taste-skill audit)**: favicon + Open Graph meta,
  skip link, `lang="en"` with English aria-labels, press feedback on every control,
  accent focus rings, `text-wrap`, tabular numerals; search empty state, inline task
  quick-add and notes editor instead of `prompt()`; 29 unicode glyph icons replaced
  by a Phosphor sprite (42 symbols); labels moved from tracked caps to sentence case,
  decorative live dot removed; DM Sans + Space Grotesk self-hosted.
- **2026-09-19, DESIGN.md created** from the reference research (§10–12).
