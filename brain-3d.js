/* =====================================================================
   BrainDump — brain-3d.js
   The brain is not a decoration: it is the memory list, drawn as a
   neural network. There is no brain at the start. The first memory you
   store seeds one neuron; every memory after it adds the next node and
   the link that grows the structure toward a brain silhouette.

   Layout: a deterministic farthest-point ordering of a brain-shaped
   point cloud (two wrinkled hemispheres, inner neurons, cerebellum,
   stem). Memory i owns slot i in that order, so old memories form the
   core and the network densifies outward. Each slot knows its parent
   (the nearest earlier slot), which keeps the structure connected.

   Rendering tiers (chosen automatically, in this order):
     1. WebGL  — Three.js, loaded on demand from a CDN     → body[data-brain-mode="webgl"]
     2. 2D     — same network, software-projected on a
                 Canvas 2D context (no WebGL, no network)  → body[data-brain-mode="2d"]
     3. CSS    — no canvas; app.js spreads markers on a
                 golden-angle ring instead                 → body[data-brain-mode="css"]

   Force a tier for testing with ?brain=webgl | 2d | css

   The module never depends on app.js. app.js talks to it through DOM events:
     braindump:anchors  { ids }     memory ids, OLDEST FIRST (slot order)
     braindump:select   { id|null } highlight one neuron
     braindump:dim      { ids|null } fade these memories (search)
     braindump:pulse    { color, strength }
     braindump:burst    { color }    a memory entered the brain
     braindump:face     { id }       rotate that memory into view
     braindump:focus    { active }   detail panel open
   and it answers every frame with:
     braindump:project  { nodes: [{ id, x, y, front }] }

   Drag anywhere on the stage to spin the brain; it stays fixed in the
   middle. No pan, no zoom, on purpose.
   ===================================================================== */
(function () {
  'use strict';

  const stage = document.getElementById('brain-stage');
  const layer = document.getElementById('brain-3d-layer');
  if (!stage || !layer) return;

  const THREE_SOURCES = [
    'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.min.js',
    'https://unpkg.com/three@0.160.1/build/three.module.min.js'
  ];
  const LOAD_TIMEOUT_MS = 9000;

  const params = new URLSearchParams(window.location.search);
  const forcedMode = params.get('brain');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* palette — kept in sync with styles.css */
  const PALETTE = {
    slate: [0.55, 0.62, 0.7],
    ember: [0.87, 0.46, 0.25],
    amber: [0.9, 0.7, 0.38],
    sage: [0.6, 0.72, 0.6],
    white: [0.94, 0.91, 0.85]
  };

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const brighten = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
  const rgba = (c, a) => `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${a})`;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------------
     shared state
     ------------------------------------------------------------------ */
  const state = {
    mode: 'loading',
    time: 0,
    rotY: -0.55,
    yawOffset: 0,
    targetYaw: 0,
    tiltX: 0.18,
    targetTiltX: 0.18,
    tiltZ: 0,
    targetTiltZ: 0,
    spin: reducedMotion ? 0 : 0.055,
    boost: 0,
    pulse: 0,
    pulseTweened: false,
    pulseColor: PALETTE.ember,
    intro: reducedMotion ? 1 : 0,
    introTweened: false,
    focus: 1,
    targetFocus: 1,
    activity: 1,
    paused: document.hidden,
    ids: [],
    idToSlot: new Map(),
    selectedId: null,
    selected: -1,
    dim: null,
    dirty: false,
    drag: { active: false, id: -1, x: 0, y: 0, t: 0, velYaw: 0 }
  };

  const BURST_COUNT = 56;
  const burst = {
    active: false,
    life: 0,
    dirty: false,
    color: PALETTE.ember,
    pos: new Float32Array(BURST_COUNT * 3),
    vel: new Float32Array(BURST_COUNT * 3)
  };

  /* ------------------------------------------------------------------
     the blueprint — a brain-shaped point cloud ordered so that the
     k-th memory lands on the k-th structural slot.

     Farthest-point sampling spreads the early slots across the whole
     silhouette (the brain is readable from the very first memories),
     while later slots fill in the gaps. parent[k] is the nearest earlier
     slot, so the drawn graph is always one connected piece.

     Per slot we also keep color/size/phase; the current positions live
     in `cur`, which eases toward the blueprint whenever the memory order
     changes (delete an old memory and the rest glide into their new
     places instead of teleporting).
     ------------------------------------------------------------------ */
  function buildStructure(profile) {
    const rand = mulberry32(20260919);
    const { surface, inner, cerebellum, stem } = profile;
    const count = surface + inner + cerebellum + stem;

    /* master cloud: raw brain points, unordered */
    const mpos = new Float32Array(count * 3);
    const mt = new Float32Array(count);        /* back→front factor */
    const mkind = new Uint8Array(count);       /* 0 cortex, 1 inner, 2 cerebellum, 3 stem */
    const mjit = new Float32Array(count * 2);  /* per-point brightness/size jitter */
    let n = 0;

    const push = (x, y, z, t, kind) => {
      mpos[n * 3] = x; mpos[n * 3 + 1] = y; mpos[n * 3 + 2] = z;
      mt[n] = t; mkind[n] = kind;
      mjit[n * 2] = rand(); mjit[n * 2 + 1] = rand();
      n++;
    };

    /* gyri & sulci — layered sine "noise" gives the folded cortex look */
    const gyri = (x, y, z) =>
      0.06 * Math.sin(7.3 * x + 1.3) * Math.sin(5.1 * y - 0.7) * Math.sin(6.4 * z + 2.1) +
      0.03 * Math.sin(11.0 * y + 3.0 * z) * Math.cos(9.0 * x + 0.5);

    for (let i = 0; i < surface; i++) {
      const side = i & 1 ? 1 : -1;
      const u = rand() * 2 - 1;
      const phi = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      let x = s * Math.cos(phi);
      const y = u;
      const z = s * Math.sin(phi);
      if (x * side < 0) x *= 0.3;                         // flat medial face (longitudinal fissure)

      let px = x * 0.56;
      let py = y * 0.7;
      let pz = z * 0.98;
      if (py < -0.28) py = -0.28 + (py + 0.28) * 0.5;     // flatter base
      if (pz > 0.45) px *= 1 - (pz - 0.45) * 0.4;         // frontal taper
      if (pz < -0.55) py += (pz + 0.55) * 0.25;           // occipital slope
      if (py < 0 && py > -0.36 && x * side > 0.35) px += side * 0.05 * (1 - Math.abs(pz)); // temporal lobe

      const g = gyri(px * 2.2, py * 2.2, pz * 2.2);
      const len = Math.hypot(px, py, pz) || 1;
      px += (px / len) * g;
      py += (py / len) * g;
      pz += (pz / len) * g;
      px += side * 0.3;                                   // hemisphere gap

      push(px, py, pz, (pz + 1) / 2, 0);
    }

    for (let i = 0; i < inner; i++) {
      const side = rand() < 0.5 ? -1 : 1;
      const u = rand() * 2 - 1;
      const phi = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = Math.cbrt(rand()) * 0.8;
      push(
        side * 0.3 + s * Math.cos(phi) * 0.45 * r,
        u * 0.58 * r,
        s * Math.sin(phi) * 0.85 * r,
        0.5,
        1
      );
    }

    for (let i = 0; i < cerebellum; i++) {
      const u = rand() * 2 - 1;
      const phi = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const ridges = 1 + 0.025 * Math.sin(20 * u);
      push(
        s * Math.cos(phi) * 0.4 * ridges,
        -0.44 + u * 0.2,
        -0.66 + s * Math.sin(phi) * 0.26 * ridges,
        0.2,
        2
      );
    }

    for (let i = 0; i < stem; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.09 + rand() * 0.06;
      const yy = -0.36 - rand() * 0.42;
      push(Math.cos(a) * r, yy, -0.32 + Math.sin(a) * r * 0.8 - (yy + 0.36) * 0.35, 0.35, 3);
    }

    /* farthest-point ordering (first slot = nearest to the centroid) */
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < count; i++) { cx += mpos[i * 3]; cy += mpos[i * 3 + 1]; cz += mpos[i * 3 + 2]; }
    cx /= count; cy /= count; cz /= count;

    const order = new Int32Array(count);
    const slotOf = new Int32Array(count).fill(-1);      /* master idx → slot */
    const d2min = new Float64Array(count).fill(Infinity);
    const nearest = new Int32Array(count).fill(-1);
    let first = 0, best = Infinity;
    for (let i = 0; i < count; i++) {
      const dx = mpos[i * 3] - cx, dy = mpos[i * 3 + 1] - cy, dz = mpos[i * 3 + 2] - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < best) { best = d2; first = i; }
    }
    order[0] = first;
    slotOf[first] = 0;
    for (let i = 0; i < count; i++) {
      const dx = mpos[i * 3] - mpos[first * 3], dy = mpos[i * 3 + 1] - mpos[first * 3 + 1], dz = mpos[i * 3 + 2] - mpos[first * 3 + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < d2min[i]) { d2min[i] = d2; nearest[i] = first; }
    }
    for (let k = 1; k < count; k++) {
      let pick = -1, far = -1;
      for (let i = 0; i < count; i++) {
        if (slotOf[i] !== -1) continue;
        if (d2min[i] > far) { far = d2min[i]; pick = i; }
      }
      order[k] = pick;
      slotOf[pick] = k;
      for (let i = 0; i < count; i++) {
        if (slotOf[i] !== -1) continue;
        const dx = mpos[i * 3] - mpos[pick * 3], dy = mpos[i * 3 + 1] - mpos[pick * 3 + 1], dz = mpos[i * 3 + 2] - mpos[pick * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < d2min[i]) { d2min[i] = d2; nearest[i] = pick; }
      }
    }

    /* reorder into per-slot arrays + tiny organic jitter */
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const cls = new Uint8Array(count);            /* 0 slate · 1 bone · 2 ember · 3 amber */
    const parent = new Int32Array(count).fill(-1);
    const children = Array.from({ length: count }, () => []);

    for (let k = 0; k < count; k++) {
      const i = order[k];
      const j1 = mjit[i * 2], j2 = mjit[i * 2 + 1];
      let x = mpos[i * 3] + (j1 - 0.5) * 0.05;
      let y = mpos[i * 3 + 1] + (j2 - 0.5) * 0.05;
      let z = mpos[i * 3 + 2] + (j1 * j2 - 0.5) * 0.05;
      positions[k * 3] = x; positions[k * 3 + 1] = y; positions[k * 3 + 2] = z;

      const kind = mkind[i];
      const t = mt[i];
      let rgb;
      if (kind === 1) { rgb = brighten(PALETTE.amber, 0.5 + j1 * 0.35); cls[k] = 3; }
      else if (kind === 2) { rgb = brighten(mix(PALETTE.sage, PALETTE.white, j1), 0.55 + j2 * 0.4); cls[k] = 1; }
      else if (kind === 3) { rgb = brighten(PALETTE.slate, 0.6 + j1 * 0.35); cls[k] = 0; }
      else {
        rgb = brighten(mix(PALETTE.slate, PALETTE.white, t), 0.78 + j1 * 0.4); // cortex: back stone → front bone
        cls[k] = t > 0.5 ? 1 : 0;
        if (j2 < 0.06) { rgb = brighten(PALETTE.ember, 0.9 + j1 * 0.5); cls[k] = 2; } // a few live neurons
      }
      for (let c = 0; c < 3; c++) colors[k * 3 + c] = rgb[c];
      sizes[k] = (kind === 0 ? 0.95 : 0.8) + j1 * (kind === 0 ? 0.7 : 0.5);
      phases[k] = rand();

      if (k > 0 && nearest[i] >= 0) {
        const p = slotOf[nearest[i]];
        if (p >= 0) { parent[k] = p; children[p].push(k); }
      }
      if (parent[k] < 0 && k > 0) { parent[k] = k - 1; children[k - 1].push(k); }
    }

    /* neighbours for the travelling signals (parent + children) */
    const neighbors = Array.from({ length: count }, (_, k) => {
      const list = children[k].slice();
      if (parent[k] >= 0) list.push(parent[k]);
      return list;
    });

    return {
      count, positions, colors, sizes, phases, cls, parent, children, neighbors, rand,
      cur: positions.slice(),
      flash: new Float32Array(count)
    };
  }

  /* ------------------------------------------------------------------
     signals — little sparks travelling along the synapses that exist
     ------------------------------------------------------------------ */
  function visibleCount(struct) {
    return Math.min(state.ids.length, struct.count);
  }

  function newSignal(struct, fromPoint, visible) {
    if (fromPoint != null) {
      const list = struct.neighbors[fromPoint];
      if (list.length) {
        const c = list[Math.floor(struct.rand() * list.length)];
        const hi = Math.max(fromPoint, c), lo = Math.min(fromPoint, c);
        if (lo >= 0 && hi < visible) return { from: lo === fromPoint ? lo : hi, to: hi === fromPoint ? lo : hi, t: 0, speed: 0.5 + struct.rand() * 0.9 };
      }
    }
    if (visible < 2) return { from: 0, to: 0, t: struct.rand(), speed: 0 };
    const b = 1 + Math.floor(struct.rand() * (visible - 1));
    const a = struct.parent[b] >= 0 && struct.parent[b] < b ? struct.parent[b] : b - 1;
    return { from: a, to: b, t: struct.rand(), speed: 0.5 + struct.rand() * 0.9 };
  }

  function createSignals(struct, amount) {
    const list = [];
    for (let i = 0; i < amount; i++) list.push({ from: 0, to: 0, t: 0, speed: 0 });
    return list;
  }

  function updateSignals(signals, struct, dt, visible) {
    const wanted = clamp(Math.floor(visible / 2), 0, signals.length);
    const speedMul = (0.6 + state.activity * 0.6) * (1 + state.pulse * 1.5) * (reducedMotion ? 0.35 : 1);
    for (let i = 0; i < signals.length; i++) {
      const s = signals[i];
      if (i >= wanted) { s.speed = 0; continue; }
      if (s.speed === 0 || s.from < 0 || s.to <= 0 || s.from >= visible || s.to >= visible) {
        Object.assign(s, newSignal(struct, null, visible));
        if (s.speed === 0) continue;
      }
      s.t += dt * s.speed * speedMul;
      if (s.t >= 1) Object.assign(s, newSignal(struct, s.to, visible));
    }
    return wanted;
  }

  function signalPosition(s, cur, out, offset) {
    const a = s.from * 3, b = s.to * 3, t = s.t;
    out[offset] = cur[a] + (cur[b] - cur[a]) * t;
    out[offset + 1] = cur[a + 1] + (cur[b + 1] - cur[a + 1]) * t;
    out[offset + 2] = cur[a + 2] + (cur[b + 2] - cur[a + 2]) * t;
  }

  /* ------------------------------------------------------------------
     burst — when a new memory enters the brain
     ------------------------------------------------------------------ */
  function spawnBurst(rgb) {
    burst.active = true;
    burst.dirty = true;
    burst.life = 1;
    burst.color = rgb;
    for (let i = 0; i < BURST_COUNT; i++) {
      const u = Math.random() * 2 - 1;
      const phi = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const dx = s * Math.cos(phi), dy = u, dz = s * Math.sin(phi);
      const speed = 0.9 + Math.random() * 1.5;
      burst.pos[i * 3] = dx * 0.12;
      burst.pos[i * 3 + 1] = dy * 0.12;
      burst.pos[i * 3 + 2] = dz * 0.12;
      burst.vel[i * 3] = dx * speed;
      burst.vel[i * 3 + 1] = dy * speed;
      burst.vel[i * 3 + 2] = dz * speed;
    }
  }

  function updateBurst(dt) {
    if (!burst.active) return;
    burst.life -= dt / 1.25;
    if (burst.life <= 0) { burst.active = false; burst.life = 0; return; }
    const drag = Math.max(0, 1 - 1.7 * dt);
    for (let i = 0; i < BURST_COUNT * 3; i++) {
      burst.pos[i] += burst.vel[i] * dt;
      burst.vel[i] *= drag;
    }
  }

  /* ------------------------------------------------------------------
     anchors — the memory list, oldest first, mapped onto the blueprint
     ------------------------------------------------------------------ */
  let structure = null; // set once a renderer starts; used by face()
  let appliedCap = -1;    // forces a slot rebuild when the tier changes

  function slotOfMemory(i, capacity) {
    return i % capacity;
  }

  function applyAnchors(ids) {
    if (!structure) return;
    const cap = structure.count;
    const prev = state.ids;
    const changed = appliedCap !== cap || prev.length !== ids.length || ids.some((id, i) => prev[i] !== id);
    if (!changed) return;
    const tierSwitch = appliedCap !== cap && prev.length === ids.length;
    appliedCap = cap;

    // new or reshuffled slots flash and slide in from their parent
    for (let i = 0; i < Math.min(ids.length, cap); i++) {
      if (tierSwitch || prev[i] === ids[i]) continue;
      const s = slotOfMemory(i, cap);
      structure.flash[s] = 1;
      if (i >= prev.length) {
        const from = structure.parent[s] >= 0 ? structure.parent[s] : Math.max(0, i - 1);
        for (let c = 0; c < 3; c++) structure.cur[s * 3 + c] = structure.cur[from * 3 + c];
      }
    }
    state.ids = ids.slice();
    state.idToSlot.clear();
    for (let i = 0; i < ids.length; i++) state.idToSlot.set(ids[i], slotOfMemory(i, cap));
    state.selected = state.selectedId != null ? (state.idToSlot.get(state.selectedId) ?? -1) : -1;
    state.dirty = true;
  }

  /* ease cur toward the blueprint whenever the order changed */
  function settle(dt) {
    if (!structure) return false;
    const vis = visibleCount(structure);
    const k = 1 - Math.exp(-dt * 5.5);
    const target = structure.positions;
    const cur = structure.cur;
    let moving = false;
    for (let i = 0; i < vis; i++) {
      const s = slotOfMemory(i, structure.count);
      for (let c = 0; c < 3; c++) {
        const delta = target[s * 3 + c] - cur[s * 3 + c];
        if (Math.abs(delta) > 0.0004) { cur[s * 3 + c] += delta * k; moving = true; }
      }
    }
    return moving;
  }

  /* ------------------------------------------------------------------
     shared per-frame integration
     ------------------------------------------------------------------ */
  function step(dt) {
    state.time += dt;
    if (!state.pulseTweened) state.pulse *= Math.exp(-dt * 3.4);
    if (!state.introTweened && state.intro < 1) state.intro = Math.min(1, state.intro + dt / 1.6);
    state.boost *= Math.exp(-dt * 1.6);
    if (!state.drag.active) state.rotY += (state.spin * state.activity + state.boost) * dt;
    const k = 1 - Math.exp(-dt * 10);
    state.yawOffset += (state.targetYaw - state.yawOffset) * k;
    state.tiltX += (state.targetTiltX - state.tiltX) * k;
    state.tiltZ += (state.targetTiltZ - state.tiltZ) * k;
    state.focus += (state.targetFocus - state.focus) * (1 - Math.exp(-dt * 5));
    if (structure) {
      let flashMax = 0;
      const f = structure.flash;
      for (let i = 0; i < f.length; i++) {
        if (f[i] > 0) { f[i] = f[i] * Math.exp(-dt * 1.1); if (f[i] < 0.01) f[i] = 0; else flashMax = Math.max(flashMax, f[i]); }
      }
      state.flashActive = flashMax > 0;
    }
  }

  function currentScale() {
    const e = easeOutCubic(state.intro);
    const breathe = 1 + Math.sin(state.time * 1.1) * 0.018 * state.activity;
    return (0.72 + 0.28 * e) * breathe * (1 + state.pulse * 0.1);
  }
  function currentYaw() {
    return state.rotY + state.yawOffset;
  }
  function currentAlpha() {
    return easeOutCubic(state.intro) * state.focus;
  }

  /* ------------------------------------------------------------------
     GSAP-assisted easing when GSAP is on the page (optional)
     ------------------------------------------------------------------ */
  function animatePulse(strength) {
    state.pulse = Math.min(1.5, state.pulse + strength);
    const g = window.gsap;
    if (!g) { state.pulseTweened = false; return; }
    state.pulseTweened = true;
    g.killTweensOf(state, 'pulse');
    g.to(state, { pulse: 0, duration: 1.1, ease: 'power2.out', onComplete: () => { state.pulseTweened = false; } });
  }
  function runIntro() {
    if (reducedMotion) { state.intro = 1; return; }
    const g = window.gsap;
    if (!g) return; // manual fallback in step()
    state.introTweened = true;
    g.to(state, { intro: 1, duration: 1.4, ease: 'expo.out', delay: 0.1, onComplete: () => { state.introTweened = false; } });
  }

  /* ------------------------------------------------------------------
     drag to spin — the brain holds its place, the world turns
     ------------------------------------------------------------------ */
  stage.addEventListener('pointerdown', event => {
    if (event.target.closest('.memory-node, button, a, input, textarea, .panel, .toast')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    state.drag.active = true;
    state.drag.id = event.pointerId;
    state.drag.x = event.clientX;
    state.drag.y = event.clientY;
    state.drag.t = event.timeStamp;
    state.drag.velYaw = 0;
    stage.classList.add('is-dragging');
    if (stage.setPointerCapture) { try { stage.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ } }
  });

  stage.addEventListener('pointermove', event => {
    const d = state.drag;
    if (!d.active || event.pointerId !== d.id) return;
    const dx = event.clientX - d.x, dy = event.clientY - d.y;
    d.x = event.clientX;
    d.y = event.clientY;
    const dtMove = Math.max(8, event.timeStamp - d.t) / 1000;
    d.t = event.timeStamp;
    state.targetYaw += dx * 0.0062;
    state.targetTiltX = clamp(state.targetTiltX - dy * 0.0045, -0.5, 0.85);
    d.velYaw = 0.75 * d.velYaw + 0.25 * (dx * 0.0062 / dtMove);
  });

  const endDrag = event => {
    const d = state.drag;
    if (!d.active || event.pointerId !== d.id) return;
    d.active = false;
    stage.classList.remove('is-dragging');
    state.boost = clamp(d.velYaw * 2.2, -3.2, 3.2); // inertia; step() decays it back to the calm idle spin
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  document.addEventListener('visibilitychange', () => { state.paused = document.hidden; });

  let activeRenderer = null;
  function setMode(mode) {
    state.mode = mode;
    document.body.dataset.brainMode = mode;
    layer.classList.toggle('is-ready', mode === 'webgl' || mode === '2d');
    document.dispatchEvent(new CustomEvent('braindump:brain-mode', { detail: { mode } }));
  }
  function observeSize(fit) {
    fit();
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(() => fit());
      ro.observe(layer);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }

  /* alpha multiplier for a slot: search-dim, selection boost */
  function slotAlpha(s, visible) {
    let a = 1;
    if (state.dim && state.dim.has(s)) a *= 0.22;
    if (s === state.selected) a *= 1.12;
    return a;
  }

  /* ------------------------------------------------------------------
     tier 1 — WebGL with Three.js
     ------------------------------------------------------------------ */
  const VERTEX_SHADER = `
    attribute vec3 aColor;
    attribute float aSize;
    attribute float aPhase;
    attribute float aAlpha;
    uniform float uTime;
    uniform float uPixelRatio;
    uniform float uPointPx;
    uniform float uCamDist;
    uniform float uPulse;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      float tw = 0.72 + 0.28 * sin(uTime * 1.7 + aPhase * 6.28318);
      vColor = aColor;
      vAlpha = tw * aAlpha;
      gl_PointSize = aSize * uPointPx * uPixelRatio * (1.0 + uPulse * 0.5) * (0.85 + 0.15 * tw) * (uCamDist / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAGMENT_SHADER = `
    uniform float uOpacity;
    uniform float uPulse;
    uniform vec3 uPulseColor;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      float glow = pow(1.0 - d * 2.0, 1.6);
      float core = smoothstep(0.18, 0.0, d);
      vec3 col = mix(vColor, uPulseColor, uPulse * 0.55) + core * 0.55;
      gl_FragColor = vec4(col, (glow * 0.85 + core * 0.6) * vAlpha * uOpacity);
    }`;

  function makeGlowTexture(THREE) {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function startWebGL(THREE) {
    const brain = buildStructure({ surface: 1500, inner: 120, cerebellum: 140, stem: 30 });
    structure = brain;
    const cap = brain.count;

    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    layer.replaceChildren(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
    const group = new THREE.Group();
    scene.add(group);

    const uniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uPointPx: { value: 3.6 },
      uCamDist: { value: 8 },
      uPulse: { value: 0 },
      uOpacity: { value: 0 },
      uPulseColor: { value: new THREE.Vector3(...PALETTE.ember) }
    };
    const pointMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });

    /* neurons (only the first visible slots are drawn) */
    const drawPos = new Float32Array(cap * 3);
    const drawCol = new Float32Array(cap * 3);
    const drawSize = new Float32Array(cap);
    const drawAlpha = new Float32Array(cap);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(drawPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(drawCol, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(drawSize, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(brain.phases, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(drawAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const points = new THREE.Points(geo, pointMaterial);
    points.renderOrder = 3;
    points.frustumCulled = false;
    group.add(points);

    /* synapses — one link per memory after the first */
    const linePositions = new Float32Array(cap * 6);
    const lineColors = new Float32Array(cap * 6);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3).setUsage(THREE.DynamicDrawUsage));
    lineGeo.setDrawRange(0, 0);
    const lineMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const lines = new THREE.LineSegments(lineGeo, lineMaterial);
    lines.renderOrder = 2;
    lines.frustumCulled = false;
    group.add(lines);

    /* travelling signals */
    const SIGNALS = 24;
    const signals = createSignals(brain, SIGNALS);
    const signalPositions = new Float32Array(SIGNALS * 3);
    const signalGeo = new THREE.BufferGeometry();
    signalGeo.setAttribute('position', new THREE.BufferAttribute(signalPositions, 3).setUsage(THREE.DynamicDrawUsage));
    signalGeo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(SIGNALS * 3).map((_, i) => PALETTE.white[i % 3]), 3));
    signalGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(SIGNALS).fill(2.6), 1));
    signalGeo.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(SIGNALS).map(() => brain.rand()), 1));
    signalGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(SIGNALS).fill(0), 1));
    const signalPoints = new THREE.Points(signalGeo, pointMaterial);
    signalPoints.renderOrder = 4;
    signalPoints.frustumCulled = false;
    group.add(signalPoints);

    /* burst particles */
    const burstGeo = new THREE.BufferGeometry();
    burstGeo.setAttribute('position', new THREE.BufferAttribute(burst.pos, 3).setUsage(THREE.DynamicDrawUsage));
    burstGeo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(BURST_COUNT * 3), 3).setUsage(THREE.DynamicDrawUsage));
    burstGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(BURST_COUNT).map(() => 1.4 + Math.random() * 1.4), 1));
    burstGeo.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(BURST_COUNT).map(() => Math.random()), 1));
    burstGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(BURST_COUNT), 1).setUsage(THREE.DynamicDrawUsage));
    const burstPoints = new THREE.Points(burstGeo, pointMaterial);
    burstPoints.renderOrder = 5;
    burstPoints.frustumCulled = false;
    group.add(burstPoints);

    /* the warmth that settles over the network as it grows */
    const glowTexture = makeGlowTexture(THREE);
    const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: 0xc98a52, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const glow = new THREE.Sprite(glowMaterial);
    glow.renderOrder = 0;
    scene.add(glow);

    let lastCount = -1;
    let lastMoving = true;

    function syncBuffers(visible) {
      const cur = brain.cur;
      const flash = brain.flash;
      for (let i = 0; i < visible; i++) {
        const s = slotOfMemory(i, cap);
        const fl = flash[s];
        const sel = s === state.selected;
        for (let c = 0; c < 3; c++) {
          drawPos[i * 3 + c] = cur[s * 3 + c];
          let col = brain.colors[s * 3 + c];
          if (fl > 0) col += (PALETTE.ember[c] - col) * fl * 0.65;
          drawCol[i * 3 + c] = Math.min(1, col + (sel ? 0.12 : 0));
        }
        drawSize[i] = brain.sizes[s] * (1 + fl * 1.1 + (sel ? 0.5 : 0));
        drawAlpha[i] = slotAlpha(s, visible) * (1 + fl * 0.4);
      }
      for (let i = 1; i < visible; i++) {
        const s = slotOfMemory(i, cap);
        const p = i < cap && brain.parent[s] >= 0 ? brain.parent[s] : slotOfMemory(i - 1, cap);
        for (let c = 0; c < 3; c++) {
          linePositions[i * 6 - 3 + c] = cur[p * 3 + c];
          linePositions[i * 6 + c] = cur[s * 3 + c];
          lineColors[i * 6 - 3 + c] = brain.colors[p * 3 + c] * 0.75;
          lineColors[i * 6 + c] = brain.colors[s * 3 + c] * 0.75;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
      lineGeo.attributes.position.needsUpdate = true;
      lineGeo.attributes.color.needsUpdate = true;
      geo.setDrawRange(0, visible);
      lineGeo.setDrawRange(0, Math.max(0, visible - 1) * 2);
    }

    function fit() {
      const w = Math.max(1, layer.clientWidth);
      const h = Math.max(1, layer.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const desiredPx = clamp(Math.min(w, h) * 0.42, 170, 300);   // network footprint in CSS pixels
      const worldSpan = 2.3;
      const camDist = (worldSpan * h / desiredPx) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      camera.position.set(0, 0.1, camDist);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      uniforms.uCamDist.value = camDist;
      uniforms.uPointPx.value = 3.6 * (desiredPx / 220);
      uniforms.uPixelRatio.value = renderer.getPixelRatio();
    }
    const unobserve = observeSize(fit);

    let last = performance.now();
    let raf = 0;
    let disposed = false;

    function frame(now) {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      if (state.paused) { last = now; return; }
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      step(dt);
      const moving = settle(dt);
      const visible = visibleCount(brain);
      const dynamic = moving || lastMoving || visible !== lastCount || state.flashActive || state.dirty;
      if (dynamic) syncBuffers(visible);
      if (state.dirty) state.dirty = false;
      lastMoving = moving; lastCount = visible;
      updateSignals(signals, brain, dt, visible);
      updateBurst(dt);

      const alpha = currentAlpha() * (visible > 0 ? 1 : 0);
      group.rotation.set(state.tiltX, currentYaw(), state.tiltZ);
      group.scale.setScalar(currentScale());

      uniforms.uTime.value = state.time;
      uniforms.uPulse.value = state.pulse;
      uniforms.uOpacity.value = alpha;
      uniforms.uPulseColor.value.set(state.pulseColor[0], state.pulseColor[1], state.pulseColor[2]);
      const density = Math.min(1, visible / 24);
      lineMaterial.opacity = (0.16 + state.pulse * 0.22) * alpha;
      glowMaterial.opacity = (0.04 + 0.15 * density + state.pulse * 0.4) * alpha;
      glowMaterial.color.setRGB(state.pulseColor[0], state.pulseColor[1], state.pulseColor[2]).lerp(new THREE.Color(0xb9a68c), 1 - Math.min(1, state.pulse));
      const glowScale = (1.4 + 1.4 * Math.min(1, visible / 120) + state.pulse * 0.6 + Math.sin(state.time * 0.9) * 0.08) * (visible > 0 ? 1 : 0);
      glow.scale.set(glowScale, glowScale, 1);

      if (visible > 0) {
        for (let i = 0; i < SIGNALS; i++) {
          signalGeo.attributes.aAlpha.array[i] = i < Math.floor(visible / 2) ? 1 : 0;
          signalPosition(signals[i], brain.cur, signalPositions, i * 3);
        }
        signalGeo.attributes.position.needsUpdate = true;
        signalGeo.attributes.aAlpha.needsUpdate = true;
        signalGeo.setDrawRange(0, clamp(Math.floor(visible / 2), 0, SIGNALS));
      } else {
        signalGeo.setDrawRange(0, 0);
      }

      if (burst.active || burst.dirty) {
        const alphaAttr = burstGeo.attributes.aAlpha;
        const colorAttr = burstGeo.attributes.aColor;
        if (burst.dirty) {
          for (let i = 0; i < BURST_COUNT; i++) {
            colorAttr.array[i * 3] = burst.color[0];
            colorAttr.array[i * 3 + 1] = burst.color[1];
            colorAttr.array[i * 3 + 2] = burst.color[2];
          }
          colorAttr.needsUpdate = true;
          burst.dirty = false;
        }
        const life = burst.active ? burst.life * burst.life : 0;
        for (let i = 0; i < BURST_COUNT; i++) alphaAttr.array[i] = life;
        alphaAttr.needsUpdate = true;
        burstGeo.attributes.position.needsUpdate = true;
      }

      renderer.render(scene, camera);

      if (visible > 0) {
        group.updateMatrixWorld(true);
        camera.updateMatrixWorld();
        const w = layer.clientWidth;
        const h = layer.clientHeight;
        const v = new THREE.Vector3();
        const nodes = [];
        for (let i = 0; i < visible; i++) {
          const s = slotOfMemory(i, cap);
          v.set(brain.cur[s * 3], brain.cur[s * 3 + 1], brain.cur[s * 3 + 2]).applyMatrix4(group.matrixWorld);
          const front = v.z;
          v.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
          nodes.push({ id: state.ids[i], x: (v.x / v.w * 0.5 + 0.5) * w, y: (0.5 - v.y / v.w * 0.5) * h, front });
        }
        document.dispatchEvent(new CustomEvent('braindump:project', { detail: { nodes } }));
      }
    }

    function dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      unobserve();
      geo.dispose(); lineGeo.dispose(); signalGeo.dispose(); burstGeo.dispose();
      pointMaterial.dispose(); lineMaterial.dispose(); glowMaterial.dispose(); glowTexture.dispose();
      renderer.dispose();
      canvas.remove();
    }

    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      console.warn('[BrainDump] WebGL context lost — switching to the 2D brain');
      dispose();
      activeRenderer = null;
      try { activeRenderer = start2D(); setMode('2d'); } catch (error) { setMode('css'); }
    }, { once: true });

    raf = requestAnimationFrame(frame);
    return { dispose, brain };
  }

  /* ------------------------------------------------------------------
     tier 2 — Canvas 2D (software projection of the same network)
     ------------------------------------------------------------------ */
  function makeSprite(rgb, size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, rgba([1, 1, 1], 0.95));
    g.addColorStop(0.18, rgba(rgb, 0.9));
    g.addColorStop(0.5, rgba(rgb, 0.28));
    g.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return c;
  }

  function start2D() {
    const brain = buildStructure({ surface: 620, inner: 50, cerebellum: 80, stem: 20 });
    structure = brain;
    const cap = brain.count;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    layer.replaceChildren(canvas);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sprites = [PALETTE.slate, PALETTE.white, PALETTE.ember, PALETTE.amber].map(c => makeSprite(c, 48));
    const whiteSprite = makeSprite(PALETTE.white, 48);
    let burstSprite = makeSprite(PALETTE.ember, 48);
    let burstSpriteColor = PALETTE.ember;

    const SIGNALS = 16;
    const signals = createSignals(brain, SIGNALS);
    const projected = new Float32Array(cap * 3);
    const tmp = new Float32Array(3);
    let w = 0, h = 0, cx = 0, cy = 0, pxPerUnit = 90, pointPx = 3.6;

    function fit() {
      w = Math.max(1, layer.clientWidth);
      h = Math.max(1, layer.clientHeight);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = w / 2;
      cy = h / 2;
      const desiredPx = clamp(Math.min(w, h) * 0.42, 170, 300);
      pxPerUnit = desiredPx / 2.3;
      pointPx = 3.6 * (desiredPx / 220);
    }
    const unobserve = observeSize(fit);

    function projectPoint(x, y, z, sc, m, out, offset) {
      // rotation order matches Three's default Euler (Z, then Y, then X)
      const x1 = x * m.cz - y * m.sz, y1 = x * m.sz + y * m.cz;
      const x2 = x1 * m.cy + z * m.sy, z2 = -x1 * m.sy + z * m.cy;
      const y3 = y1 * m.cx - z2 * m.sx, z3 = y1 * m.sx + z2 * m.cx;
      const persp = 3.6 / (3.6 - z3 * sc);
      out[offset] = cx + x2 * sc * pxPerUnit * persp;
      out[offset + 1] = cy - y3 * sc * pxPerUnit * persp;
      out[offset + 2] = persp;
    }

    let last = performance.now();
    let raf = 0;
    let disposed = false;

    const FRAME_INTERVAL = 1000 / 30; // the software path is capped at 30 fps to stay gentle
    function frame(now) {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      if (state.paused) { last = now; return; }
      if (now - last < FRAME_INTERVAL) return;
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      step(dt);
      settle(dt);
      const visible = visibleCount(brain);
      updateSignals(signals, brain, dt, visible);
      updateBurst(dt);

      const alpha = currentAlpha() * (visible > 0 ? 1 : 0);
      const sc = currentScale();
      const yaw = currentYaw();
      const m = {
        cx: Math.cos(state.tiltX), sx: Math.sin(state.tiltX),
        cy: Math.cos(yaw), sy: Math.sin(yaw),
        cz: Math.cos(state.tiltZ), sz: Math.sin(state.tiltZ)
      };
      for (let i = 0; i < visible; i++) {
        const s = slotOfMemory(i, cap);
        projectPoint(brain.cur[s * 3], brain.cur[s * 3 + 1], brain.cur[s * 3 + 2], sc, m, projected, i * 3);
      }

      if (visible > 0) {
        const nodes = [];
        for (let i = 0; i < visible; i++) {
          const s = slotOfMemory(i, cap);
          const x = brain.cur[s * 3], y = brain.cur[s * 3 + 1], z = brain.cur[s * 3 + 2];
          const x1 = x * m.cz - y * m.sz, y1 = x * m.sz + y * m.cz;
          const x2 = x1 * m.cy + z * m.sy, z2 = -x1 * m.sy + z * m.cy;
          const y3 = y1 * m.cx - z2 * m.sx, z3 = y1 * m.sx + z2 * m.cx;
          nodes.push({ id: state.ids[i], x: projected[i * 3], y: projected[i * 3 + 1], front: z3 * sc });
        }
        document.dispatchEvent(new CustomEvent('braindump:project', { detail: { nodes } }));
      }

      ctx.clearRect(0, 0, w, h);
      if (visible === 0) return;
      ctx.globalCompositeOperation = 'lighter';

      /* warmth behind the network */
      const density = Math.min(1, visible / 24);
      const glowR = pxPerUnit * (1.05 + 0.4 * density + state.pulse * 0.35);
      const glowColor = mix([0.72, 0.66, 0.56], state.pulseColor, Math.min(1, state.pulse));
      const glowGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      glowGradient.addColorStop(0, rgba(glowColor, (0.05 + 0.11 * density + state.pulse * 0.4) * alpha));
      glowGradient.addColorStop(0.45, rgba(glowColor, 0.05 * alpha));
      glowGradient.addColorStop(1, rgba(glowColor, 0));
      ctx.fillStyle = glowGradient;
      ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);

      /* synapses */
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba([0.74, 0.68, 0.56], (0.16 + state.pulse * 0.15) * alpha);
      ctx.beginPath();
      for (let i = 1; i < visible; i++) {
        // slots and memory indices coincide while i < cap, so the parent is already projected
        const pi = i < cap && brain.parent[i] >= 0 ? brain.parent[i] : i - 1;
        ctx.moveTo(projected[i * 3], projected[i * 3 + 1]);
        ctx.lineTo(projected[pi * 3], projected[pi * 3 + 1]);
      }
      ctx.stroke();

      /* neurons */
      const t = state.time;
      for (let i = 0; i < visible; i++) {
        const s = slotOfMemory(i, cap);
        const depth = projected[i * 3 + 2];
        const fl = brain.flash[s];
        const sel = s === state.selected;
        const tw = 0.72 + 0.28 * Math.sin(t * 1.7 + brain.phases[s] * 6.28318);
        const r = brain.sizes[s] * pointPx * depth * (1 + fl * 1.1 + (sel ? 0.5 : 0)) * (1 + state.pulse * 0.4) * 1.2;
        ctx.globalAlpha = clamp(0.9 * tw * alpha * clamp((depth - 0.55) / 0.7, 0.35, 1) * slotAlpha(s, visible), 0, 1);
        ctx.drawImage(fl > 0.02 || sel ? sprites[2] : sprites[brain.cls[s]], projected[i * 3] - r, projected[i * 3 + 1] - r, r * 2, r * 2);
      }

      /* signals */
      const wantedSignals = clamp(Math.floor(visible / 2), 0, SIGNALS);
      for (let i = 0; i < wantedSignals; i++) {
        signalPosition(signals[i], brain.cur, tmp, 0);
        projectPoint(tmp[0], tmp[1], tmp[2], sc, m, tmp, 0);
        const r = pointPx * 2.1 * tmp[2];
        ctx.globalAlpha = 0.9 * alpha;
        ctx.drawImage(whiteSprite, tmp[0] - r, tmp[1] - r, r * 2, r * 2);
      }

      /* burst */
      if (burst.active) {
        if (burst.color !== burstSpriteColor) { burstSprite = makeSprite(burst.color, 48); burstSpriteColor = burst.color; }
        for (let i = 0; i < BURST_COUNT; i++) {
          projectPoint(burst.pos[i * 3], burst.pos[i * 3 + 1], burst.pos[i * 3 + 2], sc, m, tmp, 0);
          const r = pointPx * 1.8 * tmp[2];
          ctx.globalAlpha = burst.life * burst.life * alpha;
          ctx.drawImage(burstSprite, tmp[0] - r, tmp[1] - r, r * 2, r * 2);
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    function dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      unobserve();
      canvas.remove();
    }

    raf = requestAnimationFrame(frame);
    return { dispose, brain };
  }

  /* ------------------------------------------------------------------
     public API + event bridge
     ------------------------------------------------------------------ */
  const api = {
    get mode() { return state.mode; },
    get debug() {
      return {
        mode: state.mode,
        memories: state.ids.length,
        visible: structure ? visibleCount(structure) : 0,
        yaw: state.rotY + state.yawOffset,
        tilt: state.tiltX,
        dragging: state.drag.active
      };
    },
    pulse(color, strength = 1) {
      state.pulseColor = PALETTE[color] || PALETTE.ember;
      animatePulse(clamp(strength, 0.1, 2));
      state.boost += 0.35 * strength;
    },
    burst(color) {
      spawnBurst(PALETTE[color] || PALETTE.ember);
      api.pulse(color, 1.3);
      state.boost += 1.2;
    },
    nudge(amount = 1) { state.boost += 1.4 * amount; },
    face(id) {
      if (!structure || id == null) return;
      const s = state.idToSlot.get(id);
      if (s == null) return;
      const x = structure.positions[s * 3], z = structure.positions[s * 3 + 2], y = structure.positions[s * 3 + 1];
      if (Math.hypot(x, z) > 0.02) {
        // bring the node to the camera-facing meridian
        const delta = Math.atan2(-x, z) - state.rotY;
        state.targetYaw = ((delta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      }
      state.targetTiltX = clamp(0.18 + y * 0.55, -0.42, 0.8);
    },
    setFocus(active) {
      state.targetFocus = active ? 0.62 : 1;
      state.activity = active ? 0.75 : 1;
    },
    setActivity(level) { state.activity = clamp(Number(level) || 1, 0.2, 2); }
  };
  window.BrainDump3D = api;

  document.addEventListener('braindump:anchors', event => { applyAnchors(((event.detail || {}).ids || [])); });
  document.addEventListener('braindump:select', event => {
    const id = (event.detail || {}).id;
    state.selectedId = id;
    state.selected = id == null ? -1 : (state.idToSlot.get(id) ?? -1);
    state.dirty = true;
  });
  document.addEventListener('braindump:dim', event => {
    const ids = (event.detail || {}).ids;
    if (!ids || !ids.length) { state.dim = null; state.dirty = true; return; }
    const set = new Set();
    for (const id of ids) { const s = state.idToSlot.get(id); if (s != null) set.add(s); }
    state.dim = set;
    state.dirty = true;
  });
  document.addEventListener('braindump:face', event => { api.face((event.detail || {}).id); });
  document.addEventListener('braindump:pulse', event => { const d = event.detail || {}; api.pulse(d.color, d.strength ?? 1); });
  document.addEventListener('braindump:burst', event => { api.burst((event.detail || {}).color); });
  document.addEventListener('braindump:focus', event => { api.setFocus(Boolean((event.detail || {}).active)); });
  document.addEventListener('braindump:nudge', event => { api.nudge((event.detail || {}).amount ?? 1); });

  /* ------------------------------------------------------------------
     boot
     ------------------------------------------------------------------ */
  function hasWebGL() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return false;
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return true;
    } catch (error) {
      return false;
    }
  }
  function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out loading ${label}`)), ms);
      promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
  }
  function loadThree() {
    return THREE_SOURCES.reduce(
      (chain, url) => chain.catch(() => withTimeout(import(/* webpackIgnore: true */ url), LOAD_TIMEOUT_MS, url)),
      Promise.reject(new Error('no source tried yet'))
    );
  }

  async function boot() {
    setMode('loading');
    if (forcedMode === 'css') { setMode('css'); return; }

    if (forcedMode !== '2d' && hasWebGL()) {
      try {
        const THREE = await loadThree();
        activeRenderer = startWebGL(THREE);
        setMode('webgl');
        applyAnchors(state.ids);
        runIntro();
        return;
      } catch (error) {
        console.warn('[BrainDump] 3D brain unavailable, using the 2D fallback →', error && error.message);
      }
    }

    try {
      activeRenderer = start2D();
      setMode('2d');
      applyAnchors(state.ids);
      runIntro();
    } catch (error) {
      console.warn('[BrainDump] 2D brain unavailable, using the CSS core →', error && error.message);
      setMode('css');
    }
  }

  boot();
})();
