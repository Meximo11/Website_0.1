/* =====================================================================
   BrainDump — brain-3d.js
   A living neural brain for the centre of the map.

   Rendering tiers (chosen automatically, in this order):
     1. WebGL  — Three.js, loaded on demand from a CDN     → body[data-brain-mode="webgl"]
     2. 2D     — same point cloud, software-projected onto
                 a Canvas 2D context (no WebGL, no network) → body[data-brain-mode="2d"]
     3. CSS    — the glyph core from styles.css only        → body[data-brain-mode="css"]

   Force a tier for testing with ?brain=webgl | 2d | css

   The module never depends on app.js. app.js talks to it through DOM events:
     braindump:transform  { x, y, zoom }      keep the brain aligned with the map
     braindump:pulse      { color, strength } a thought was selected / touched
     braindump:burst      { color }           a new thought entered the brain
     braindump:focus      { active }          focus mode on / off
     braindump:nudge      { amount }          give the brain a little spin
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
    blue: [0.474, 0.663, 1.0],
    violet: [0.698, 0.549, 1.0],
    orange: [1.0, 0.624, 0.478],
    mint: [0.498, 0.89, 0.765],
    white: [0.92, 0.95, 1.0]
  };
  const CLASS_COLORS = [PALETTE.blue, PALETTE.violet, PALETTE.orange];

  /* ------------------------------------------------------------------
     shared animation state (both renderers read from here)
     ------------------------------------------------------------------ */
  const state = {
    mode: 'loading',
    time: 0,
    rotY: -0.7,
    yawOffset: 0,
    targetYaw: 0,
    tiltX: 0.22,
    targetTiltX: 0.22,
    tiltZ: 0,
    targetTiltZ: 0,
    spin: reducedMotion ? 0 : 0.14,
    boost: 0,
    pulse: 0,
    pulseTweened: false,
    pulseColor: PALETTE.violet,
    intro: reducedMotion ? 1 : 0,
    introTweened: false,
    focus: 1,
    targetFocus: 1,
    activity: 1,
    paused: document.hidden
  };

  const BURST_COUNT = 56;
  const burst = {
    active: false,
    life: 0,
    dirty: false,
    color: PALETTE.violet,
    pos: new Float32Array(BURST_COUNT * 3),
    vel: new Float32Array(BURST_COUNT * 3)
  };

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const brighten = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
  const rgba = (c, a) => `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${a})`;

  /* deterministic random so the brain looks the same on every visit */
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
     brain geometry — two wrinkled hemispheres, inner neurons,
     a cerebellum and a short brain stem, plus synapse links
     ------------------------------------------------------------------ */
  function buildBrain(profile) {
    const rand = mulberry32(20260919);
    const { surface, inner, cerebellum, stem, maxLinks, linkDistance } = profile;
    const count = surface + inner + cerebellum + stem;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const classes = new Uint8Array(count);
    let n = 0;

    const push = (x, y, z, rgb, size, cls) => {
      positions[n * 3] = x;
      positions[n * 3 + 1] = y;
      positions[n * 3 + 2] = z;
      colors[n * 3] = rgb[0];
      colors[n * 3 + 1] = rgb[1];
      colors[n * 3 + 2] = rgb[2];
      sizes[n] = size;
      phases[n] = rand();
      classes[n] = cls;
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

      const t = (pz + 1) / 2;                             // back → front : violet → blue
      const rgb = brighten(mix(PALETTE.violet, PALETTE.blue, t), 0.7 + rand() * 0.5);
      push(px, py, pz, rgb, 0.55 + rand() * 0.75, t > 0.5 ? 0 : 1);
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
        brighten(PALETTE.violet, 0.35 + rand() * 0.35),
        0.45 + rand() * 0.5,
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
        brighten(PALETTE.orange, 0.6 + rand() * 0.5),
        0.6 + rand() * 0.6,
        2
      );
    }

    for (let i = 0; i < stem; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.09 + rand() * 0.06;
      const yy = -0.36 - rand() * 0.42;
      push(Math.cos(a) * r, yy, -0.32 + Math.sin(a) * r * 0.8 - (yy + 0.36) * 0.35, brighten(PALETTE.violet, 0.6 + rand() * 0.3), 0.55 + rand() * 0.4, 1);
    }

    const { pairs, adjacency } = buildLinks(positions, count, linkDistance, maxLinks, rand);
    return { count, positions, colors, sizes, phases, classes, pairs, adjacency, rand };
  }

  /* nearest-neighbour links via a uniform grid */
  function buildLinks(positions, count, dist, maxLinks, rand, perPoint = 3) {
    const cell = dist;
    const grid = new Map();
    const keyOf = (ix, iy, iz) => `${ix},${iy},${iz}`;
    for (let i = 0; i < count; i++) {
      const k = keyOf(Math.floor(positions[i * 3] / cell), Math.floor(positions[i * 3 + 1] / cell), Math.floor(positions[i * 3 + 2] / cell));
      const bucket = grid.get(k);
      if (bucket) bucket.push(i); else grid.set(k, [i]);
    }

    const order = Array.from({ length: count }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    const pairs = [];
    const seen = new Set();
    const d2max = dist * dist;
    outer: for (const i of order) {
      const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
      const ix = Math.floor(x / cell), iy = Math.floor(y / cell), iz = Math.floor(z / cell);
      const candidates = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const bucket = grid.get(keyOf(ix + dx, iy + dy, iz + dz));
        if (!bucket) continue;
        for (const j of bucket) {
          if (j === i) continue;
          const ex = positions[j * 3] - x, ey = positions[j * 3 + 1] - y, ez = positions[j * 3 + 2] - z;
          const d2 = ex * ex + ey * ey + ez * ez;
          if (d2 < d2max) candidates.push([d2, j]);
        }
      }
      candidates.sort((a, b) => a[0] - b[0]);
      for (let c = 0; c < Math.min(perPoint, candidates.length); c++) {
        const j = candidates[c][1];
        const a = Math.min(i, j), b = Math.max(i, j);
        const k = a * count + b;
        if (seen.has(k)) continue;
        seen.add(k);
        pairs.push(a, b);
        if (pairs.length / 2 >= maxLinks) break outer;
      }
    }

    const adjacency = Array.from({ length: count }, () => []);
    for (let l = 0; l < pairs.length / 2; l++) {
      adjacency[pairs[l * 2]].push(l);
      adjacency[pairs[l * 2 + 1]].push(l);
    }
    return { pairs: Int32Array.from(pairs), adjacency };
  }

  /* ------------------------------------------------------------------
     signals — little sparks travelling along the synapses
     ------------------------------------------------------------------ */
  function newSignal(brain, fromPoint) {
    const linkCount = brain.pairs.length / 2;
    let link;
    const adj = fromPoint != null ? brain.adjacency[fromPoint] : null;
    if (adj && adj.length) link = adj[Math.floor(brain.rand() * adj.length)];
    else link = Math.floor(brain.rand() * linkCount);
    let a = brain.pairs[link * 2];
    let b = brain.pairs[link * 2 + 1];
    if (fromPoint != null && b === fromPoint) { const t = a; a = b; b = t; }
    return { from: a, to: b, t: fromPoint == null ? brain.rand() : 0, speed: 0.45 + brain.rand() * 0.8 };
  }
  function createSignals(brain, amount) {
    const list = [];
    for (let i = 0; i < amount; i++) list.push(newSignal(brain, null));
    return list;
  }
  function updateSignals(signals, brain, dt) {
    const speedMul = (0.6 + state.activity * 0.6) * (1 + state.pulse * 1.5) * (reducedMotion ? 0.35 : 1);
    for (const s of signals) {
      s.t += dt * s.speed * speedMul;
      if (s.t >= 1) Object.assign(s, newSignal(brain, s.to));
    }
  }
  function signalPosition(s, positions, out, offset) {
    const a = s.from * 3, b = s.to * 3, t = s.t;
    out[offset] = positions[a] + (positions[b] - positions[a]) * t;
    out[offset + 1] = positions[a + 1] + (positions[b + 1] - positions[a + 1]) * t;
    out[offset + 2] = positions[a + 2] + (positions[b + 2] - positions[a + 2]) * t;
  }

  /* ------------------------------------------------------------------
     burst — when a new thought enters the brain
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
     shared per-frame integration
     ------------------------------------------------------------------ */
  function step(dt) {
    state.time += dt;
    if (!state.pulseTweened) state.pulse *= Math.exp(-dt * 3.4);
    if (!state.introTweened && state.intro < 1) state.intro = Math.min(1, state.intro + dt / 1.6);
    state.boost *= Math.exp(-dt * 1.6);
    state.rotY += (state.spin * state.activity + state.boost) * dt;
    const k = 1 - Math.exp(-dt * 4.5);
    state.yawOffset += (state.targetYaw - state.yawOffset) * k;
    state.tiltX += (state.targetTiltX - state.tiltX) * k;
    state.tiltZ += (state.targetTiltZ - state.tiltZ) * k;
    state.focus += (state.targetFocus - state.focus) * (1 - Math.exp(-dt * 5));
  }

  function currentScale() {
    const e = easeOutCubic(state.intro);
    const breathe = 1 + Math.sin(state.time * 1.1) * 0.018 * state.activity;
    return (0.55 + 0.45 * e) * breathe * (1 + state.pulse * 0.1);
  }
  function currentYaw() {
    return state.rotY + state.yawOffset - (1 - easeOutCubic(state.intro)) * 1.2;
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
    g.to(state, { intro: 1, duration: 2.2, ease: 'expo.out', delay: 0.2, onComplete: () => { state.introTweened = false; } });
  }

  /* ------------------------------------------------------------------
     pointer parallax + lifecycle
     ------------------------------------------------------------------ */
  if (!reducedMotion) {
    stage.addEventListener('pointermove', event => {
      const rect = stage.getBoundingClientRect();
      const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      state.targetYaw = nx * 0.35;
      state.targetTiltX = 0.22 + ny * 0.2;
      state.targetTiltZ = -nx * 0.08;
    });
    stage.addEventListener('pointerleave', () => {
      state.targetYaw = 0;
      state.targetTiltX = 0.22;
      state.targetTiltZ = 0;
    });
  }
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
    const brain = buildBrain({ surface: 2100, inner: 160, cerebellum: 200, stem: 40, maxLinks: 1100, linkDistance: 0.17 });
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
      uPointPx: { value: 2.7 },
      uCamDist: { value: 8 },
      uPulse: { value: 0 },
      uOpacity: { value: 0 },
      uPulseColor: { value: new THREE.Vector3(...PALETTE.violet) }
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

    /* neurons */
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(brain.positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(brain.colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(brain.sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(brain.phases, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(brain.count).fill(1), 1));
    const points = new THREE.Points(geo, pointMaterial);
    points.renderOrder = 3;
    group.add(points);

    /* synapses */
    const linkCount = brain.pairs.length / 2;
    const linePositions = new Float32Array(linkCount * 6);
    const lineColors = new Float32Array(linkCount * 6);
    for (let l = 0; l < linkCount; l++) {
      const a = brain.pairs[l * 2], b = brain.pairs[l * 2 + 1];
      for (let c = 0; c < 3; c++) {
        linePositions[l * 6 + c] = brain.positions[a * 3 + c];
        linePositions[l * 6 + 3 + c] = brain.positions[b * 3 + c];
        lineColors[l * 6 + c] = brain.colors[a * 3 + c] * 0.9;
        lineColors[l * 6 + 3 + c] = brain.colors[b * 3 + c] * 0.9;
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
    const lineMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const lines = new THREE.LineSegments(lineGeo, lineMaterial);
    lines.renderOrder = 2;
    group.add(lines);

    /* travelling signals */
    const SIGNALS = 28;
    const signals = createSignals(brain, SIGNALS);
    const signalPositions = new Float32Array(SIGNALS * 3);
    const signalGeo = new THREE.BufferGeometry();
    signalGeo.setAttribute('position', new THREE.BufferAttribute(signalPositions, 3).setUsage(THREE.DynamicDrawUsage));
    signalGeo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(SIGNALS * 3).map((_, i) => PALETTE.white[i % 3]), 3));
    signalGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(SIGNALS).fill(2.4), 1));
    signalGeo.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(SIGNALS).map(() => brain.rand()), 1));
    signalGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(SIGNALS).fill(1), 1));
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

    /* soft glow behind and a bright core inside */
    const glowTexture = makeGlowTexture(THREE);
    const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: 0xb28cff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const glow = new THREE.Sprite(glowMaterial);
    glow.renderOrder = 0;
    scene.add(glow);
    const coreMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: 0x9dc0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const core = new THREE.Sprite(coreMaterial);
    core.renderOrder = 1;
    scene.add(core);

    function fit() {
      const w = Math.max(1, layer.clientWidth);
      const h = Math.max(1, layer.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const desiredPx = clamp(Math.min(w, h) * 0.42, 170, 300);   // brain footprint in CSS pixels
      const worldSpan = 2.3;
      const camDist = (worldSpan * h / desiredPx) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      camera.position.set(0, 0.1, camDist);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      uniforms.uCamDist.value = camDist;
      uniforms.uPointPx.value = 2.7 * (desiredPx / 220);
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
      updateSignals(signals, brain, dt);
      updateBurst(dt);

      const alpha = currentAlpha();
      group.rotation.set(state.tiltX, currentYaw(), state.tiltZ);
      group.scale.setScalar(currentScale());

      uniforms.uTime.value = state.time;
      uniforms.uPulse.value = state.pulse;
      uniforms.uOpacity.value = alpha;
      uniforms.uPulseColor.value.set(state.pulseColor[0], state.pulseColor[1], state.pulseColor[2]);
      lineMaterial.opacity = (0.13 + state.pulse * 0.22) * alpha;
      glowMaterial.opacity = (0.17 + state.pulse * 0.4) * alpha;
      glowMaterial.color.setRGB(state.pulseColor[0], state.pulseColor[1], state.pulseColor[2]).lerp(new THREE.Color(0xb28cff), 1 - Math.min(1, state.pulse));
      const glowScale = 2.5 + state.pulse * 0.7 + Math.sin(state.time * 0.9) * 0.08;
      glow.scale.set(glowScale, glowScale, 1);
      coreMaterial.opacity = (0.2 + state.pulse * 0.5) * alpha;
      const coreScale = 0.9 + state.pulse * 0.25;
      core.scale.set(coreScale, coreScale, 1);

      for (let i = 0; i < SIGNALS; i++) signalPosition(signals[i], brain.positions, signalPositions, i * 3);
      signalGeo.attributes.position.needsUpdate = true;

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
    }

    function dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      unobserve();
      geo.dispose(); lineGeo.dispose(); signalGeo.dispose(); burstGeo.dispose();
      pointMaterial.dispose(); lineMaterial.dispose(); glowMaterial.dispose(); coreMaterial.dispose(); glowTexture.dispose();
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
    return { dispose };
  }

  /* ------------------------------------------------------------------
     tier 2 — Canvas 2D (software projection of the same brain)
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
    const brain = buildBrain({ surface: 820, inner: 80, cerebellum: 110, stem: 24, maxLinks: 420, linkDistance: 0.21 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    layer.replaceChildren(canvas);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sprites = CLASS_COLORS.map(c => makeSprite(c, 48));
    const whiteSprite = makeSprite(PALETTE.white, 48);
    let burstSprite = makeSprite(PALETTE.violet, 48);
    let burstSpriteColor = PALETTE.violet;

    const SIGNALS = 22;
    const signals = createSignals(brain, SIGNALS);
    const projected = new Float32Array(brain.count * 3);
    const tmp = new Float32Array(3);
    let w = 0, h = 0, cx = 0, cy = 0, pxPerUnit = 90, pointPx = 3;

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
      pointPx = 2.7 * (desiredPx / 220);
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
      updateSignals(signals, brain, dt);
      updateBurst(dt);

      const alpha = currentAlpha();
      const sc = currentScale();
      const yaw = currentYaw();
      const m = {
        cx: Math.cos(state.tiltX), sx: Math.sin(state.tiltX),
        cy: Math.cos(yaw), sy: Math.sin(yaw),
        cz: Math.cos(state.tiltZ), sz: Math.sin(state.tiltZ)
      };
      for (let i = 0; i < brain.count; i++) {
        projectPoint(brain.positions[i * 3], brain.positions[i * 3 + 1], brain.positions[i * 3 + 2], sc, m, projected, i * 3);
      }

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      /* glow + core */
      const glowR = pxPerUnit * (1.25 + state.pulse * 0.35);
      const glowColor = mix([0.698, 0.549, 1.0], state.pulseColor, Math.min(1, state.pulse));
      const glowGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      glowGradient.addColorStop(0, rgba(glowColor, (0.16 + state.pulse * 0.4) * alpha));
      glowGradient.addColorStop(0.45, rgba(glowColor, 0.08 * alpha));
      glowGradient.addColorStop(1, rgba(glowColor, 0));
      ctx.fillStyle = glowGradient;
      ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);
      const coreR = pxPerUnit * (0.42 + state.pulse * 0.12);
      const coreGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      coreGradient.addColorStop(0, rgba(PALETTE.blue, (0.18 + state.pulse * 0.4) * alpha));
      coreGradient.addColorStop(1, rgba(PALETTE.blue, 0));
      ctx.fillStyle = coreGradient;
      ctx.fillRect(cx - coreR, cy - coreR, coreR * 2, coreR * 2);

      /* synapses — grouped into four depth buckets to limit state changes */
      const linkCount = brain.pairs.length / 2;
      ctx.lineWidth = 1;
      for (let bucket = 0; bucket < 4; bucket++) {
        ctx.strokeStyle = rgba([0.6, 0.64, 1.0], (0.06 + bucket * 0.06) * (1 + state.pulse * 0.9) * alpha);
        ctx.beginPath();
        for (let l = 0; l < linkCount; l++) {
          const a = brain.pairs[l * 2] * 3, b = brain.pairs[l * 2 + 1] * 3;
          const depth = (projected[a + 2] + projected[b + 2]) / 2;
          const bkt = clamp(Math.floor((depth - 0.72) / 0.14), 0, 3);
          if (bkt !== bucket) continue;
          ctx.moveTo(projected[a], projected[a + 1]);
          ctx.lineTo(projected[b], projected[b + 1]);
        }
        ctx.stroke();
      }

      /* neurons */
      const t = state.time;
      for (let i = 0; i < brain.count; i++) {
        const depth = projected[i * 3 + 2];
        const tw = 0.72 + 0.28 * Math.sin(t * 1.7 + brain.phases[i] * 6.28318);
        const r = brain.sizes[i] * pointPx * depth * (1 + state.pulse * 0.4) * 1.15;
        ctx.globalAlpha = clamp(0.8 * tw * alpha * clamp((depth - 0.55) / 0.7, 0.3, 1), 0, 1);
        ctx.drawImage(sprites[brain.classes[i]], projected[i * 3] - r, projected[i * 3 + 1] - r, r * 2, r * 2);
      }

      /* signals */
      for (const s of signals) {
        signalPosition(s, brain.positions, tmp, 0);
        projectPoint(tmp[0], tmp[1], tmp[2], sc, m, tmp, 0);
        const r = pointPx * 2.2 * tmp[2];
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
    return { dispose };
  }

  /* ------------------------------------------------------------------
     public API + event bridge
     ------------------------------------------------------------------ */
  const api = {
    get mode() { return state.mode; },
    pulse(color, strength = 1) {
      state.pulseColor = PALETTE[color] || PALETTE.violet;
      animatePulse(clamp(strength, 0.1, 2));
      state.boost += 0.35 * strength;
    },
    burst(color) {
      spawnBurst(PALETTE[color] || PALETTE.violet);
      api.pulse(color, 1.3);
      state.boost += 1.2;
    },
    nudge(amount = 1) { state.boost += 1.4 * amount; },
    setFocus(active) {
      state.targetFocus = active ? 0.42 : 1;
      state.activity = active ? 0.6 : 1;
    },
    setActivity(level) { state.activity = clamp(Number(level) || 1, 0.2, 2); },
    setTransform(x, y, zoom) {
      layer.style.transform = `translate(${x || 0}px, ${y || 0}px) scale(${(zoom || 100) / 100})`;
    }
  };
  window.BrainDump3D = api;

  document.addEventListener('braindump:transform', event => { const d = event.detail || {}; api.setTransform(d.x, d.y, d.zoom); });
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
        runIntro();
        return;
      } catch (error) {
        console.warn('[BrainDump] 3D brain unavailable, using the 2D fallback →', error && error.message);
      }
    }

    try {
      activeRenderer = start2D();
      setMode('2d');
      runIntro();
    } catch (error) {
      console.warn('[BrainDump] 2D brain unavailable, using the CSS core →', error && error.message);
      setMode('css');
    }
  }

  boot();
})();
