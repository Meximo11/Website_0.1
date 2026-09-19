/* =====================================================================
   BrainDump — app.js
   The memory layer. Everything you type is stored in localStorage and
   mirrored twice: as a row in the rail and as a node in the brain.
   The brain renderer (brain-3d.js) is spoken to only through DOM
   events (braindump:anchors / braindump:project / braindump:pulse ...),
   so each layer works on its own. The brain starts empty: no demo data,
   ever.
   ===================================================================== */

const STORAGE_KEY = 'braindump:memories:v1';
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const motion = {
  get gsap() { return window.gsap; },
  get on() { return Boolean(window.gsap) && !reducedMotion; }
};

/* ---------- memory store ---------- */

function loadMemories() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(m => m && typeof m.title === 'string' && m.title.trim())
      .map(m => ({
        id: String(m.id || makeId()),
        title: m.title.slice(0, 160),
        body: typeof m.body === 'string' ? m.body.slice(0, 4000) : '',
        createdAt: Number(m.createdAt) || Date.now(),
        updatedAt: Number(m.updatedAt) || Number(m.createdAt) || Date.now()
      }));
  } catch (error) {
    console.warn('[BrainDump] unreadable store, starting clean:', error);
    return [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
}

function makeId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const memories = loadMemories();
let selectedId = null;
let query = '';
let lastDeleted = null;
let toastTimer = 0;
let panelStateTimer = 0;
let saveTimer = 0;
let deleteArmed = false;
const markers = new Map();

/* ---------- dom refs ---------- */

const rail = $('#rail');
const listEl = $('#memory-list');
const markersEl = $('#memory-markers');
const stage = $('#brain-stage');
const panel = $('#memory-panel');
const titleInput = $('#panel-title');
const bodyInput = $('#panel-body');
const composerInput = $('#composer-input');
const composerSend = $('#composer-send');
const searchInput = $('#search-input');
const searchClear = $('#search-clear');

/* ---------- tiny helpers ---------- */

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function emit(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(`braindump:${name}`, { detail }));
}

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const fullFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function humanAge(ts) {
  const diff = (ts - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return dateFmt.format(ts);
}

function rowDate(ts) {
  const sameYear = new Date(ts).getFullYear() === new Date().getFullYear();
  if (Date.now() - ts < 3600 * 1000 * 6 && sameYear) return humanAge(ts);
  return sameYear ? dateFmt.format(ts) : fullFmt.format(ts);
}

/* ---------- toast ---------- */

function showToast(message, { tone = 'ok', action = null, onAction = null } = {}) {
  const toast = $('#toast');
  $('#toast-message').textContent = message;
  $('.toast-icon .icon use', toast)?.setAttribute('href', tone === 'warn' ? '#i-trash' : '#i-check');
  toast.classList.toggle('is-warn', tone === 'warn');
  toast.classList.add('is-visible');
  const actionBtn = $('#toast-action');
  if (action) {
    actionBtn.textContent = action;
    actionBtn.hidden = false;
    actionBtn.onclick = () => {
      hideToast();
      onAction?.();
    };
  } else {
    actionBtn.hidden = true;
    actionBtn.onclick = null;
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 6000 : 2600);
}

function hideToast() {
  clearTimeout(toastTimer);
  $('#toast').classList.remove('is-visible');
}

/* ---------- rendering ---------- */

function filtered() {
  if (!query) return memories;
  const needle = query.toLowerCase();
  return memories.filter(m => (m.title + ' ' + m.body).toLowerCase().includes(needle));
}

function renderCounts() {
  const total = memories.length;
  const shown = filtered().length;
  $('#top-count').textContent = `${total} ${total === 1 ? 'memory' : 'memories'}`;
  $('#rail-count').textContent = query ? `${shown} / ${total}` : String(total);
}

function renderRail() {
  const visible = new Set(filtered().map(m => m.id));
  listEl.innerHTML = '';
  for (const m of memories) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'memory-row';
    if (!visible.has(m.id)) row.classList.add('is-hidden');
    if (m.id === selectedId) row.classList.add('is-active');
    row.dataset.id = m.id;
    row.innerHTML = `
      <span class="row-date"></span>
      <span class="row-title"></span>
      ${m.body ? '<span class="row-excerpt"></span>' : ''}`;
    $('.row-date', row).textContent = rowDate(m.createdAt);
    $('.row-title', row).textContent = m.title;
    if (m.body) $('.row-excerpt', row).textContent = m.body.replace(/\s+/g, ' ');
    row.addEventListener('click', () => selectMemory(m.id));
    row.addEventListener('mouseenter', () => markers.get(m.id)?.classList.add('is-hot'));
    row.addEventListener('mouseleave', () => markers.get(m.id)?.classList.remove('is-hot'));
    listEl.appendChild(row);
  }
  $('#rail-empty').hidden = memories.length > 0 || query;
  const noMatch = $('#rail-no-match');
  noMatch.hidden = !(query && visible.size === 0);
  $('#no-match-query').textContent = query;
}

function renderMarkers() {
  const wanted = new Set(memories.map(m => m.id));
  for (const [id, el] of markers) {
    if (!wanted.has(id)) {
      el.remove();
      markers.delete(id);
    }
  }
  for (const m of memories) {
    if (markers.has(m.id)) updateMarker(m);
    else markers.set(m.id, createMarker(m));
  }
  emit('anchors', { ids: memories.map(m => m.id) });
  applySearchToMarkers();
  if (brainMode() === 'css') layoutRing();
}

function createMarker(m) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'memory-node is-new';
  btn.dataset.id = m.id;
  btn.innerHTML = `
    <span class="node-anchor">
      <span class="node-ring" aria-hidden="true"></span>
      <span class="node-dot" aria-hidden="true"></span>
      <span class="node-tag"><span class="tag-date"></span><span class="tag-clip"></span></span>
    </span>`;
  updateMarker(m, btn);
  btn.addEventListener('click', event => {
    event.stopPropagation();
    selectMemory(m.id);
  });
  btn.addEventListener('pointerdown', event => event.stopPropagation());
  markersEl.appendChild(btn);
  setTimeout(() => btn.classList.remove('is-new'), 1200);
  return btn;
}

function updateMarker(m, el = markers.get(m.id)) {
  if (!el) return;
  $('.tag-date', el).textContent = rowDate(m.createdAt);
  $('.tag-clip', el).textContent = m.title;
  el.setAttribute('aria-label', `${m.title}. Memory from ${fullFmt.format(m.createdAt)}. Open details.`);
  el.classList.toggle('is-selected', m.id === selectedId);
}

function applySearchToMarkers() {
  const visible = new Set(filtered().map(m => m.id));
  for (const [id, el] of markers) {
    el.classList.toggle('is-dim', query ? !visible.has(id) : false);
  }
}

function renderAll() {
  renderRail();
  renderMarkers();
  renderCounts();
  $('#stage-empty').hidden = memories.length > 0;
}

/* ---------- brain tiers ---------- */

function brainMode() {
  return document.body.dataset.brainMode || 'loading';
}

/* the 3D/2D tiers project every anchored brain point once per frame and
   hand us screen coordinates; the CSS tier has nothing, so we spread the
   markers on a golden-angle ring around the aura */
document.addEventListener('braindump:project', event => {
  const nodes = event.detail?.nodes || [];
  const seen = new Set();
  for (const node of nodes) {
    const el = markers.get(node.id);
    if (!el) continue;
    seen.add(node.id);
    el.style.setProperty('--x', `${node.x.toFixed(1)}px`);
    el.style.setProperty('--y', `${node.y.toFixed(1)}px`);
    el.classList.toggle('is-back', node.front < 0.02);
  }
  for (const [id, el] of markers) {
    if (!seen.has(id)) el.classList.add('is-back');
  }
});

document.addEventListener('braindump:brain-mode', event => {
  /* the brain module boots after app.js ran: re-emit the anchors so a cold
     load with stored memories does not leave the markers parked at center */
  emit('anchors', { ids: memories.map(m => m.id) });
  if (event.detail?.mode === 'css') layoutRing();
});

let ringTimer = 0;
function layoutRing() {
  if (brainMode() !== 'css') return;
  const rect = stage.getBoundingClientRect();
  const radius = Math.min(rect.width, rect.height) * 0.31;
  const cx = rect.width / 2;
  const cy = rect.height * 0.44;
  memories.forEach((m, i) => {
    const el = markers.get(m.id);
    if (!el) return;
    const angle = i * 2.399963;
    const jitter = 0.86 + hash(m.id) % 28 / 100;
    el.style.setProperty('--x', `${(cx + Math.cos(angle) * radius * jitter).toFixed(1)}px`);
    el.style.setProperty('--y', `${(cy + Math.sin(angle) * radius * 0.72 * jitter).toFixed(1)}px`);
    el.classList.remove('is-back', 'is-dim');
    el.classList.toggle('is-dim', Boolean(query) && !filtered().some(v => v.id === m.id));
  });
}

function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1000;
}

/* if the brain never reports back (offline CDN, blocked context), fall
   back to the CSS tier instead of waiting forever */
setTimeout(() => {
  if (brainMode() === 'loading') {
    document.body.dataset.brainMode = 'css';
    layoutRing();
  }
}, 4200);
window.addEventListener('resize', () => layoutRing());

/* ---------- selection + panel ---------- */

function selectMemory(id) {
  selectedId = id;
  if (window.matchMedia('(max-width: 1080px)').matches) setRail(false);
  const m = memories.find(x => x.id === id);
  $$('.memory-row').forEach(row => row.classList.toggle('is-active', row.dataset.id === id));
  for (const [markerId, el] of markers) el.classList.toggle('is-selected', markerId === id);
  if (!m) return;
  titleInput.value = m.title;
  bodyInput.value = m.body;
  $('#panel-date span').textContent = `${fullFmt.format(m.createdAt)} · ${humanAge(m.createdAt)}`;
  $('#panel-age-text').textContent = humanAge(m.updatedAt);
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
  emit('focus', { active: true });
  if (markers.get(id)?.classList.contains('is-back')) emit('face', { id });
  armDelete(false);
  autosize(bodyInput);
  if (motion.on) {
    motion.gsap.fromTo(panel, { opacity: 0.4 }, { opacity: 1, duration: 0.4, ease: 'power2.out' });
  }
}

function closePanel() {
  flushPanelEdit();
  selectedId = null;
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
  $$('.memory-row').forEach(row => row.classList.remove('is-active'));
  for (const el of markers.values()) el.classList.remove('is-selected');
  emit('focus', { active: false });
}

$('#panel-close').addEventListener('click', closePanel);

titleInput.addEventListener('input', schedulePanelEdit);
bodyInput.addEventListener('input', () => {
  autosize(bodyInput);
  schedulePanelEdit();
});
titleInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    bodyInput.focus();
  }
});

function schedulePanelEdit() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPanelEdit, 400);
}

function flushPanelEdit() {
  clearTimeout(saveTimer);
  if (!selectedId) return;
  const m = memories.find(x => x.id === selectedId);
  if (!m) return;
  const nextTitle = titleInput.value.trim() || 'Untitled';
  const nextBody = bodyInput.value.trim();
  if (m.title === nextTitle && m.body === nextBody) return;
  m.title = nextTitle.slice(0, 160);
  m.body = nextBody.slice(0, 4000);
  m.updatedAt = Date.now();
  save();
  renderRail();
  updateMarker(m);
  const state = $('#panel-state');
  state.classList.add('is-saved');
  clearTimeout(panelStateTimer);
  panelStateTimer = setTimeout(() => state.classList.remove('is-saved'), 1400);
}

function armDelete(next) {
  deleteArmed = next;
  $('#panel-delete').hidden = next;
  $('#panel-delete-confirm').hidden = !next;
}

$('#panel-delete').addEventListener('click', () => armDelete(true));
$('#panel-delete-confirm').addEventListener('click', () => {
  armDelete(false);
  deleteMemory(selectedId);
});

/* ---------- add / delete ---------- */

function addMemory(rawText) {
  const text = rawText.trim();
  if (!text) return;
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const memory = {
    id: makeId(),
    title: (lines[0] || 'Untitled').slice(0, 160),
    body: lines.slice(1).join('\n').slice(0, 4000),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  memories.unshift(memory);
  save();
  renderAll();
  emit('anchors', { ids: memories.map(m => m.id) });
  emit('pulse', { color: 'ember', strength: 1.15 });
  if (memories.length === 1) emit('burst', { color: 'amber' });
  showToast('Stored. It has a node now.');
}

function deleteMemory(id) {
  const index = memories.findIndex(m => m.id === id);
  if (index < 0) return;
  const [removed] = memories.splice(index, 1);
  lastDeleted = { memory: removed, index };
  closePanel();
  save();
  renderAll();
  showToast('Memory deleted.', {
    tone: 'warn',
    action: 'Undo',
    onAction: () => {
      if (!lastDeleted) return;
      memories.splice(lastDeleted.index, 0, lastDeleted.memory);
      lastDeleted = null;
      save();
      renderAll();
      showToast('Back where it was.');
    }
  });
}

/* ---------- composer ---------- */

function autosize(el) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
}

composerInput.addEventListener('input', () => {
  autosize(composerInput);
  composerSend.disabled = !composerInput.value.trim();
});

composerInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitComposer();
  }
  if (event.key === 'Escape') composerInput.blur();
});

$('#composer').addEventListener('submit', event => {
  event.preventDefault();
  submitComposer();
});

function submitComposer() {
  const text = composerInput.value;
  if (!text.trim()) return;
  addMemory(text);
  composerInput.value = '';
  autosize(composerInput);
  composerSend.disabled = true;
}

$('#new-btn').addEventListener('click', () => {
  composerInput.focus();
  stage.scrollIntoView({ block: 'nearest' });
});

/* ---------- search ---------- */

function applySearch() {
  query = searchInput.value.trim();
  searchClear.hidden = !query;
  renderRail();
  applySearchToMarkers();
  renderCounts();
  if (brainMode() === 'css') layoutRing();
}

searchInput.addEventListener('input', applySearch);
searchInput.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    searchInput.value = '';
    applySearch();
    searchInput.blur();
  }
  if (event.key === 'Enter') {
    const first = filtered()[0];
    if (first) selectMemory(first.id);
  }
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  applySearch();
  searchInput.focus();
});

$('#no-match-add').addEventListener('click', () => {
  composerInput.value = query;
  searchInput.value = '';
  applySearch();
  composerInput.focus();
  autosize(composerInput);
  composerSend.disabled = false;
});

/* ---------- rail drawer + search toggle + about ---------- */

const railToggle = $('#rail-toggle');
const scrim = $('#scrim');

function setRail(open) {
  document.body.classList.toggle('rail-open', open);
  railToggle.setAttribute('aria-expanded', String(open));
  scrim.hidden = !open;
}

railToggle.addEventListener('click', () => setRail(!document.body.classList.contains('rail-open')));
scrim.addEventListener('click', () => {
  setRail(false);
  document.body.classList.remove('search-open');
  $('#search-toggle').setAttribute('aria-expanded', 'false');
});

const searchToggle = $('#search-toggle');
searchToggle.addEventListener('click', () => {
  const open = document.body.classList.toggle('search-open');
  searchToggle.setAttribute('aria-expanded', String(open));
  if (open) searchInput.focus();
});

const aboutBtn = $('#about-btn');
const aboutPop = $('#about-pop');

function setAbout(open) {
  aboutPop.hidden = !open;
  aboutBtn.setAttribute('aria-expanded', String(open));
}

aboutBtn.addEventListener('click', () => setAbout(aboutPop.hidden));
document.addEventListener('click', event => {
  if (!aboutPop.hidden && !aboutPop.contains(event.target) && !aboutBtn.contains(event.target)) {
    setAbout(false);
  }
});

/* ---------- zoom + pan over the whole brain field ---------- */

const view = { x: 0, y: 0, zoom: 100 };
let dragState = null;

function applyView() {
  emit('transform', { x: view.x, y: view.y, zoom: view.zoom });
}

stage.addEventListener('wheel', event => {
  event.preventDefault();
  const next = view.zoom - Math.sign(event.deltaY) * 8;
  view.zoom = Math.min(180, Math.max(60, next));
  applyView();
}, { passive: false });

stage.addEventListener('pointerdown', event => {
  if (event.target.closest('.memory-node')) return;
  dragState = { id: event.pointerId, x: event.clientX - view.x, y: event.clientY - view.y };
  stage.classList.add('is-dragging');
});

stage.addEventListener('pointermove', event => {
  if (!dragState || event.pointerId !== dragState.id) return;
  view.x = event.clientX - dragState.x;
  view.y = Math.max(-140, Math.min(140, event.clientY - dragState.y));
  applyView();
});

const endDrag = event => {
  if (dragState && event.pointerId === dragState.id) {
    dragState = null;
    stage.classList.remove('is-dragging');
  }
};

stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('dblclick', () => {
  view.x = 0;
  view.y = 0;
  view.zoom = 100;
  applyView();
});

/* ---------- export / import ---------- */

$('#export-btn').addEventListener('click', () => {
  const payload = {
    app: 'BrainDump',
    version: 1,
    exportedAt: new Date().toISOString(),
    memories
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `braindump-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 800);
  showToast(`Exported ${memories.length} ${memories.length === 1 ? 'memory' : 'memories'}.`);
});

$('#import-btn').addEventListener('click', () => $('#import-file').click());

$('#import-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const incoming = Array.isArray(parsed) ? parsed : parsed?.memories;
    if (!Array.isArray(incoming)) throw new Error('missing memories array');
    const existing = new Set(memories.map(m => m.id));
    let added = 0;
    for (const item of loadMemoriesFrom(incoming)) {
      if (existing.has(item.id)) continue;
      memories.unshift(item);
      existing.add(item.id);
      added++;
    }
    memories.sort((a, b) => b.createdAt - a.createdAt);
    save();
    renderAll();
    showToast(added ? `Imported ${added} ${added === 1 ? 'memory' : 'memories'}.` : 'Nothing new to import.');
  } catch (error) {
    console.warn('[BrainDump] import failed:', error);
    showToast('That file does not look like a BrainDump export.', { tone: 'warn' });
  }
});

function loadMemoriesFrom(items) {
  return items
    .filter(m => m && typeof m.title === 'string' && m.title.trim())
    .map(m => ({
      id: String(m.id || makeId()),
      title: m.title.slice(0, 160),
      body: typeof m.body === 'string' ? m.body.slice(0, 4000) : '',
      createdAt: Number(m.createdAt) || Date.now(),
      updatedAt: Number(m.updatedAt) || Number(m.createdAt) || Date.now()
    }));
}

/* ---------- keyboard ---------- */

const isTyping = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el?.isContentEditable;
};

document.addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === '/' && !isTyping()) {
    event.preventDefault();
    document.body.classList.add('search-open');
    searchInput.focus();
    return;
  }
  if ((event.key === 'n' || event.key === 'N') && !isTyping()) {
    event.preventDefault();
    composerInput.focus();
    return;
  }
  if (event.key === '?' && !isTyping()) {
    event.preventDefault();
    setAbout(aboutPop.hidden);
    return;
  }
  if (event.key === 'Escape') {
    if (!aboutPop.hidden) setAbout(false);
    else if (document.body.classList.contains('rail-open')) setRail(false);
    else if (selectedId) closePanel();
  }
});

/* ---------- entrance ---------- */

function entrance() {
  if (!motion.on) return;
  const g = motion.gsap;
  try {
    g.from('.topbar', { y: -16, opacity: 0, duration: 0.7, ease: 'power3.out' });
    g.from('.rail', { opacity: 0, x: -14, duration: 0.7, delay: 0.1, ease: 'power3.out' });
    g.from('.composer', { y: 26, opacity: 0, duration: 0.8, delay: 0.15, ease: 'power3.out' });
    if (memories.length) g.from('.memory-row', { opacity: 0, y: 10, duration: 0.5, stagger: 0.035, delay: 0.2, ease: 'power2.out' });
    else g.from('.stage-empty', { opacity: 0, y: 14, duration: 0.8, delay: 0.3, ease: 'power3.out' });
  } catch (error) {
    /* motion is optional by design */
  }
}

/* ---------- go ---------- */

renderAll();
entrance();

/* keep "edited x ago" honest while the panel stays open */
setInterval(() => {
  if (!selectedId) return;
  const m = memories.find(x => x.id === selectedId);
  if (m) $('#panel-age-text').textContent = humanAge(m.updatedAt);
}, 60 * 1000);
