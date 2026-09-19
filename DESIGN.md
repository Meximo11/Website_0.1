# BrainDump — DESIGN.md

> AI-readable design system for BrainDump plus a short list of curated design
> references. Format follows the DESIGN.md convention promoted by
> [styles.refero.design](https://styles.refero.design/) so any agent (Arena,
> Claude Code, Cursor, …) can pick it up in a future session.
>
> Source of truth for the values below is `styles.css` (tokens), `app.js`
> (motion) and `brain-3d.js` (the brain palette). Keep them in sync when you
> change one.

---

## 1. Essence

**Your memories, one node each.** — warm, dark, archival.

BrainDump is a memory room, not a dashboard. Deep warm graphite
(`#14120f`, never pure black), bone-coloured type, and exactly one accent
(ember) that belongs to memories: their nodes, the composer button,
selection. The 3D brain floats centred like a specimen in a museum vitrine;
it breathes, rotates with the pointer and lights up when you store
something. The interface must not look AI-generated: no violet gradients,
no glass confetti, no neon glow, no stock hero copy, and no seeded demo
content of any kind. An empty brain is a finished state, not a bug.

Closest published relatives (see §9): **Dala** (constellation on a quiet
field, restraint as luxury), **Resend** (hairline borders instead of
shadows), editorial archive sites like **Are.na** (monospace meta, paper
logic).

## 2. Colour palette

### Core tokens (`:root`)

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#14120f` | page base (gradient on top) |
| `--bg-deep` | `#100e0b` | html behind everything |
| `--panel` | `#1a1713` | topbar pill, composer, rail drawer, about |
| `--raised` | `#201c17` | toast, inner surfaces |
| `--text` | `#ece5d8` | primary type (bone, not pure white) |
| `--text-soft` | `#c9c0ae` | panel body copy |
| `--muted` | `#a39a88` | secondary meta |
| `--faint` | `#7c7365` | labels, placeholders |
| `--line` | bone @ 9% | hairlines everywhere |
| `--line-strong` | bone @ 18% | focus/hover borders |
| `--ember` | `#d97840` | the one accent: nodes, primary buttons, selection |
| `--ember-hi` | `#e8925e` | hover |
| `--danger` | `#c25b4a` | delete only |
| `--sage` | `#9fb89a` | saved/toast check only |

Rules: violet/purple is banned from this repo (2026-09 pivot, the user
asked for a non-AI look). Embers appear at most on: the node dots + halos,
the New button, the composer send, selection states and the eyebrow dot.
Everything else is bone-on-graphite.

### Brain palette (`PALETTE` in brain-3d.js)

| Key | RGB | Where |
| --- | --- | --- |
| `slate` | `0.55, 0.62, 0.70` | back hemisphere, stem, inner haze |
| `white` | `0.94, 0.91, 0.85` | front-facing cortical points, signals |
| `ember` | `0.87, 0.46, 0.25` | ~4% live synapses, pulse, burst default |
| `amber` | `0.90, 0.70, 0.38` | inner neuron glow |
| `sage` | `0.60, 0.72, 0.60` | cerebellum blend |

## 3. Typography

| Role | Face | Size / weight |
| --- | --- | --- |
| Display (empty state h1, panel title) | Fraunces variable 300–700 | `clamp(34px, 4.6vw, 54px)` / 400–480, slight negative tracking |
| Wordmark | Fraunces | 19px / 500 |
| UI body | DM Sans variable | 15–16px / 400–550 |
| Meta labels (dates, rail h2, counts, hints) | Space Grotesk | 11–12px / 500–600, 0.05–0.18em tracking, uppercase |

All fonts self-hosted from `fonts/` (Latin subsets, variable weight). No
Google Fonts links, no Inter, no system-stack as the identity face. Numbers
use `font-variant-numeric: tabular-nums`.

## 4. Spacing & shape

- Base rhythm 6px; component padding multiples of it.
- Radii: `--r-s` 10 (small chips), `--r-m` 16 (rows), `--r-l` 24 (panels,
  composer), pills 999. Buttons are circles or pills; there are no square
  cards.
- The rail is not boxed: hairline border only. Panels, topbar, composer and
  toast are the floating ones (outer 1px hairline + inner top highlight +
  long soft shadow: the "double bezel" pattern).
- Max text column in the empty state: 480px.

## 5. Surfaces & elevation

Three layers, always in this order: page gradient → panel (`#1a1713` at
~94% with a hairline) → raised (`#201c17`). Shadows are warm and diffuse
(`0 30px 70px -30px rgba(0,0,0,.65)`), never tight and grey. `backdrop-blur`
only on the fixed topbar and composer. A fixed film-grain overlay
(SVG `feTurbulence`, opacity 0.05, `pointer-events:none`, z 60) sits over
everything to kill the flat-vector look. Backgrounds carry two very faint
warm radial glows (amber from top, ember from bottom), maximum 5% alpha.

## 6. Motion

- Easing: `cubic-bezier(.32,.72,0,1)` for entrances, `( .45,0,.15,1)` for
  breathing loops. No `ease-in-out` defaults.
- Durations: hovers 0.2s, panels 0.4–0.55s, brain intro ~1.6s.
- The brain owns ambient motion: breath (1.8% scale sine), a slow idle spin
  (0.055 rad/s), travelling signals, pulse on save, burst on the very first
  memory. Drag anywhere on the stage to spin the network by hand (spring
  follow plus release inertia); there is no pan and no zoom: the brain holds
  the exact centre of the layout.
- A node appearing runs one `node-bloom` ring expansion (1.1s), then stops;
  persistent blinking is banned.
- Selecting from the rail rotates the brain toward the node (`face`) and
  dims the brain (focus 0.62) so the node and panel read first.
- GSAP is optional choreography; CSS transitions are the floor. Every
  animation sits behind `prefers-reduced-motion`.

## 7. The brain (three tiers)

The brain is the memory list drawn as a neural network. There is no
decorative brain without memories: the stage is literally empty until the
first memory lights the seed neuron (slot 0 sits at the centroid). A
deterministic farthest-point ordering of a brain-shaped point cloud (two
hemispheres, inner neurons, cerebellum, stem) is the blueprint; memory k
owns slot k, so the silhouette spreads outward as the collection grows.
Every slot links to its parent (the nearest earlier slot), which keeps the
graph one connected piece, and deleting an old memory shifts the rest by
one slot — they ease into their new places instead of teleporting.

1. **WebGL** (Three.js 0.160 from CDN): shader points with twinkle, ember
   flash on birth and a selection tint; one line segment per memory after
   the first; signals only travel along visible links; the warm glow fades
   in with density (`min(1, visible / 24)`).
2. **Canvas 2D**: same network and arrays, software projection at 30fps.
3. **CSS aura**: no canvas; markers arrange on a golden-angle ring so the
   app stays fully usable.

`body[data-brain-mode]` announces the tier; `window.BrainDump3D` exposes
`pulse(color, strength)`, `burst(color)`, `setFocus(active)`, `face(id)`
and `debug` (mode / memories / visible / yaw / tilt). The app side speaks
only through `braindump:*` CustomEvents: `anchors` with the memory ids
**oldest-first**, `select`, `dim` (search), plus `project`, `pulse`,
`burst`, `focus`, `face`. Beyond the blueprint capacity (1,790 slots in
WebGL, 770 in the 2D tier) slots wrap and two memories may share one
position. Nodes on the far side get `is-back` (12% opacity, not
clickable); spinning the brain brings them around.

## 8. Layout

- Desktop ≥1080: grid `336px | 1fr`. Rail (list) left, stage (brain +
  markers) right; composer fixed bottom-centre of the stage; panel fixed
  right card; topbar one floating pill spanning both columns.
- ≤1080: rail becomes a drawer (`#rail-toggle`), panel a right card.
- ≤760: search moves to an overlay row (`#search-toggle`), panel slides up
  as a bottom sheet, New collapses to the circle icon.
- z-index discipline: scrim 33 < composer 32–46 family < topbar 40 < toast 46
  < grain 60. Skip-link 90.

## 9. Do / Don't

**Do**

- keep the interface English, sentence case, specific words; no em-dashes
  anywhere user-facing
- say "stored on this device" rather than "encrypted bank-grade privacy"
- dim instead of hide when filtering (search keeps the brain readable)
- keep every affordance inside the DOM (no native `prompt`/`alert`/
  `confirm`; delete is a two-step inline confirm with undo)
- treat the empty state as a designed screen (Fraunces headline, one line,
  one way forward)

**Don't**

- never seed, demo or invent memories; an empty store is the honest state
- no violet/purple hues, no gradient-painted headlines, no glow cards
- no decorative dot rows, no generic "Unlock/Elevate/seamless" copy
- no icons outside the Phosphor sprite, no emoji in UI copy
- no `box-shadow` glow on hover for text buttons; hover changes colour,
  not altitude, except the two pill CTAs which lift 1px

## 10. Design references (what to borrow)

- [kokonutui.com](https://kokonutui.com/) — component rhythm, numbered
  step sections, terminal-style meta; structure only (it is React/Tailwind,
  this repo stays vanilla)
- [styles.refero.design](https://styles.refero.design/) — Dala (restraint,
  one accent, big type), Resend (hairlines over shadows)
- [godly.design](https://godly.design/) — dark editorial galleries; note how
  they use whitespace instead of borders
- Are.na — monospace meta labels, quiet grey chrome, data as content

## 11. Backlog (UI)

1. mood or type dot per memory (semantic colour only)
2. date brush: jump the camera to memories of a chosen day (`face` batch)
3. drag a node onto "shelf" to archive without deleting
4. weekly digest view (the keep list), still zero sample data
5. IndexedDB + history (undo beyond one step)

## 12. Changelog (design)

- **2026-09-19, emergent structure**: the always-on particle ball is gone —
  the network IS the memories (seed neuron, birth-order slots, parent
  links), replacing id-hash anchoring on a decorative cortex; drag-to-spin
  with inertia replaces pointer parallax; map-style zoom/pan is removed and
  the brain is fixed in the centre; selection and search now reach the
  canvas (highlight, dim); the layout row is clamped to `100dvh` so a long
  rail list can never push the brain below its own centre.
- **2026-09-19, "memory room" rebuild**: whole UI rewritten. The mind-map
  layer (CSS nodes, SVG connections, fake 247-count) is deleted; the 3D
  brain becomes the interface and every node is a real stored memory.
  Palette pivots from midnight-navy + violet/blue/orange/mint to warm
  graphite + bone + a single ember. Fraunces joins as the display face.
  Rail, composer, panel and toast rebuilt as floating bezel cards; grain
  overlay added. Detail panel keeps editing but drops tasks/progress/
  deadline theatrics that were demo scaffolding.
- 2026-09-19, redesign pass (pre-rebuild): favicon/meta/a11y, inline
  editing replacing `prompt()`, Phosphor sprite, sentence case, self-hosted
  fonts, GSAP entrance rework, quick-add fix, platform-aware shortcuts.
- 2026-09-19, initial: midnight-observatory concept with 3D brain and
  violet/blue/orange/mint node colours.
