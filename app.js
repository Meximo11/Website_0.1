/* =====================================================================
   BrainDump — app.js
   Interaction layer for the brain map. Motion is powered by GSAP when it is
   available (window.gsap) and degrades to plain CSS transitions otherwise.
   The animated brain (brain-3d.js) is addressed only through DOM events, so
   each layer works on its own.
   ===================================================================== */

const nodeData = {
  core: { parent: 'Workspace', title: 'My Brain', status: 'Living map', progress: 100, tasks: [], notes: 'A gentle, visual home for everything you think about.', parentColor: 'violet', color: 'violet' },
  school: { parent: 'My Brain', title: 'School', status: 'In progress', progress: 58, tasks: ['Math exam tomorrow', 'Review English vocabulary', 'Pack school bag'], notes: 'Keep the next step small. Future me will thank me.', parentColor: 'blue', color: 'blue' },
  coding: { parent: 'My Brain', title: 'Coding', status: 'In progress', progress: 64, tasks: ['Ship the BrainDump prototype', 'Refactor graph interactions', 'Write a short launch note'], notes: 'Make useful things, then make them feel good.', parentColor: 'violet', color: 'violet' },
  personal: { parent: 'My Brain', title: 'Personal', status: 'In progress', progress: 42, tasks: ['Clean up the desk', 'Plan the weekend'], notes: 'A little space creates a lot of clarity.', parentColor: 'orange', color: 'orange' },
  ideas: { parent: 'My Brain', title: 'Ideas', status: 'Open', progress: 18, tasks: ['Capture the good ones', 'Pick one to explore'], notes: 'Not every idea needs to become a project today.', parentColor: 'orange', color: 'mint' },
  math: { parent: 'School', title: 'Math exam', status: 'Deadline soon', progress: 35, tasks: ['Review chapter 4 formulas', 'Solve practice sheet'], notes: 'Tomorrow. Focus on formulas first, then practice.', parentColor: 'blue', color: 'blue', deadline: true },
  english: { parent: 'School', title: 'English', status: 'Open', progress: 25, tasks: ['Learn vocabulary', 'Read one sample essay'], notes: 'Friday is close, but there is enough time.', parentColor: 'blue', color: 'blue' },
  website: { parent: 'Coding', title: 'Website', status: 'In progress', progress: 80, tasks: ['Landing page structure', 'Set up navigation', 'Choose color system', 'Build brain map prototype', 'Polish the animations'], completed: 4, notes: 'The first version should feel calm and alive. Add subtle animations without distracting from the thought itself.', parentColor: 'violet', color: 'violet' },
  godot: { parent: 'Coding', title: 'Godot', status: 'Open', progress: 36, tasks: ['Prototype player movement', 'Find a sound palette'], notes: 'A small experiment is enough for today.', parentColor: 'violet', color: 'violet' },
  hotel: { parent: 'Personal', title: 'Hotel', status: 'Open', progress: 0, tasks: ['Compare two options'], notes: 'A quiet place with a good breakfast.', parentColor: 'orange', color: 'orange' },
  budget: { parent: 'Personal', title: 'Budget', status: 'Open', progress: 20, tasks: ['Check subscriptions'], notes: 'Make the invisible visible once a month.', parentColor: 'orange', color: 'orange' },
  training: { parent: 'Personal', title: 'Training', status: 'Open', progress: 50, tasks: ['Book a session'], notes: 'Consistency over intensity.', parentColor: 'violet', color: 'mint' },
  travel: { parent: 'Personal', title: 'Travel', status: 'Open', progress: 15, tasks: ['Choose a weekend'], notes: 'Somewhere new, not necessarily far away.', parentColor: 'violet', color: 'mint' }
};

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const stage = $('#brain-stage');
const detailPanel = $('#detail-panel');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let selectedId = 'website';
let historyIndex = 0;
let toastTimer;
let customThoughts = Number(localStorage.getItem('braindump-custom-thoughts') || 0);
let dragState = null;
let zoomTween = null;
let modalTween = null;
const view = { x: 0, y: 0, zoom: 100 };

/* ---------- motion helpers ---------- */
const motion = {
  get gsap() { return window.gsap; },
  get on() { return Boolean(window.gsap) && !reducedMotion; }
};

/* the animated brain listens for these — see brain-3d.js */
function emit(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(`braindump:${name}`, { detail }));
}

function showToast(message, type = 'success') {
  const toast = $('#toast');
  $('#toast-message').textContent = message;
  $('.toast-icon', toast).textContent = type === 'info' ? '✦' : '✓';
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
}

function nodeCount() {
  return 247 + customThoughts;
}

function setCountLabels(value) {
  const rounded = Math.round(value);
  $('#thought-total').textContent = rounded;
  $('#visible-count').textContent = `${rounded} thoughts`;
  $('.brain-core small').textContent = `${rounded} thoughts`;
  $('.nav-count').textContent = rounded;
}

function updateCountLabels({ animate = false } = {}) {
  const target = nodeCount();
  if (animate && motion.on) {
    const counter = { value: Number($('#thought-total').textContent) || 0 };
    motion.gsap.to(counter, { value: target, duration: 1.4, ease: 'power2.out', onUpdate: () => setCountLabels(counter.value) });
    return;
  }
  setCountLabels(target);
}

function renderTasks(data) {
  const list = $('#task-list');
  list.innerHTML = '';
  data.tasks.forEach((task, index) => {
    const done = data.title === 'Website' ? index < (data.completed ?? 0) : false;
    const label = document.createElement('label');
    label.className = `task-row${done ? ' done' : ''}`;
    label.innerHTML = `<input type="checkbox" ${done ? 'checked' : ''} /><span class="checkmark">✓</span><span>${escapeHtml(task)}</span>`;
    list.appendChild(label);
  });
  $('#task-count').textContent = data.tasks.length;
  bindTaskInputs();
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function renderConnections(id) {
  const parent = nodeData[id]?.parent || 'Coding';
  const colorClass = nodeData[id]?.parentColor || 'violet';
  $('.connection-list').innerHTML = `
    <button class="connection-chip"><span class="chip-dot ${colorClass}"></span>${escapeHtml(parent)} <span>↗</span></button>
    <button class="connection-chip"><span class="chip-dot blue"></span>${id === 'school' || id === 'math' ? 'Learning' : 'Design system'} <span>↗</span></button>
    <button class="connection-chip"><span class="chip-dot orange"></span>${id === 'personal' ? 'Wellbeing' : 'Personal brand'} <span>↗</span></button>`;
}

function pulseNode(node) {
  if (!node || !motion.on) return;
  const icon = $('.node-icon', node) || node;
  motion.gsap.fromTo(icon, { scale: 1 }, { scale: 1.16, duration: 0.16, yoyo: true, repeat: 1, ease: 'power2.inOut', clearProps: 'transform' });
}

function animatePanelRefresh() {
  if (!motion.on) return;
  motion.gsap.fromTo('.detail-scroll > *', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.38, stagger: 0.05, ease: 'power3.out', clearProps: 'transform,opacity', overwrite: true });
}

function selectNode(id, { silent = false } = {}) {
  const data = nodeData[id];
  if (!data) return;
  const changed = selectedId !== id;
  selectedId = id;
  $$('.thought-node, .brain-core').forEach(node => node.classList.toggle('selected', node.dataset.nodeId === id));
  $('#panel-parent').textContent = data.parent;
  $('#panel-title').textContent = data.title;
  $('#panel-status').textContent = data.status;
  $('#panel-progress-text').textContent = `${data.progress}%`;
  $('#panel-progress-bar').style.width = `${data.progress}%`;
  $('#notes-copy').textContent = data.notes;
  const pill = $('.status-pill');
  pill.classList.toggle('deadline-pill', Boolean(data.deadline));
  pill.classList.toggle('active-pill', !data.deadline);
  renderTasks(data);
  renderConnections(id);
  detailPanel.classList.remove('closed');

  if (silent) return;
  pulseNode($(`[data-node-id="${id}"]`));
  if (changed) animatePanelRefresh();
  emit('pulse', { color: data.color || 'violet', strength: id === 'core' ? 1.4 : 0.8 });
}

function bindTaskInputs() {
  $$('.task-row input').forEach(input => input.addEventListener('change', event => {
    const row = event.target.closest('.task-row');
    row.classList.toggle('done', event.target.checked);
    const rows = $$('.task-row');
    const completed = rows.filter(task => $('input', task).checked).length;
    const progress = rows.length ? Math.round((completed / rows.length) * 100) : 0;
    $('#panel-progress-text').textContent = `${progress}%`;
    $('#panel-progress-bar').style.width = `${progress}%`;
    if (nodeData[selectedId]) {
      nodeData[selectedId].progress = progress;
      if (selectedId === 'website') nodeData[selectedId].completed = completed;
    }
    if (event.target.checked) emit('pulse', { color: 'mint', strength: 0.6 });
    showToast(event.target.checked ? 'Task completed' : 'Task reopened');
  }));
}

$$('[data-node-id]').forEach(node => node.addEventListener('click', () => selectNode(node.dataset.nodeId)));
$('#close-panel').addEventListener('click', () => detailPanel.classList.add('closed'));

$('#add-task').addEventListener('click', () => {
  const task = window.prompt('Neue Aufgabe für diesen Gedanken:');
  if (!task?.trim()) return;
  const data = nodeData[selectedId];
  data.tasks.push(task.trim());
  renderTasks(data);
  if (motion.on) motion.gsap.from('.task-row:last-child', { opacity: 0, x: -12, duration: 0.35, ease: 'power3.out', clearProps: 'all' });
  showToast('Task added to this thought');
});

$('#edit-notes').addEventListener('click', () => {
  const data = nodeData[selectedId];
  const updated = window.prompt('Notiz bearbeiten:', data.notes);
  if (updated === null) return;
  data.notes = updated.trim() || data.notes;
  $('#notes-copy').textContent = data.notes;
  showToast('Note updated');
});

$('#archive-action').addEventListener('click', () => {
  const title = nodeData[selectedId]?.title || 'Thought';
  const node = $(`[data-node-id="${selectedId}"]`);
  if (node && selectedId !== 'core') node.classList.add('archived');
  showToast(`${title} moved to archive`);
});

$('#delete-action').addEventListener('click', () => {
  const title = nodeData[selectedId]?.title || 'Thought';
  const node = $(`[data-node-id="${selectedId}"]`);
  const finish = () => {
    if (node && selectedId !== 'core') node.remove();
    showToast(`${title} removed`, 'info');
    selectNode('core');
  };
  if (node && selectedId !== 'core' && motion.on) {
    motion.gsap.to(node, { opacity: 0, duration: 0.3, ease: 'power2.in', onComplete: finish });
    motion.gsap.to($('.node-icon', node), { scale: 0.4, duration: 0.3, ease: 'power2.in' });
  } else {
    finish();
  }
});

function addThought() {
  const input = $('#dump-input');
  const value = input.value.trim();
  if (!value) {
    input.focus();
    showToast('Write whatever is on your mind first', 'info');
    if (motion.on) motion.gsap.fromTo('.dump-composer', { x: -6 }, { x: 6, duration: 0.07, repeat: 5, yoyo: true, ease: 'sine.inOut', clearProps: 'x' });
    return;
  }
  const fragments = value.split(/[.!?]+/).map(part => part.trim()).filter(Boolean);
  const amount = Math.max(1, fragments.length);
  customThoughts += amount;
  localStorage.setItem('braindump-custom-thoughts', customThoughts);
  updateCountLabels({ animate: true });
  input.value = '';
  input.style.height = 'auto';
  $('#dump-status').textContent = '0 thoughts ready';
  showToast(`${amount} ${amount === 1 ? 'thought saved' : 'thoughts saved'} to your brain`);

  const newest = document.createElement('button');
  newest.className = 'thought-node tiny-node custom-node';
  newest.dataset.nodeId = `custom-${Date.now()}`;
  newest.innerHTML = `<span class="node-halo"></span><span class="node-icon">✦</span><strong>${escapeHtml((fragments[0] || value).slice(0, 16))}${(fragments[0] || value).length > 16 ? '…' : ''}</strong><small>just now</small>`;
  newest.style.left = `${38 + Math.random() * 24}%`;
  newest.style.top = `${18 + Math.random() * 25}%`;
  $('#node-layer').appendChild(newest);
  newest.addEventListener('click', () => {
    nodeData[newest.dataset.nodeId] = { parent: 'Inbox', title: fragments[0] || value, status: 'New thought', progress: 0, tasks: [], notes: value, parentColor: 'violet', color: 'violet' };
    selectNode(newest.dataset.nodeId);
  });

  emit('burst', { color: 'violet' });
  if (motion.on) {
    const g = motion.gsap;
    g.from(newest, { opacity: 0, duration: 0.5, ease: 'power2.out', clearProps: 'opacity' });
    g.from($('.node-icon', newest), { scale: 0, duration: 0.8, ease: 'back.out(2.2)', clearProps: 'transform' });
    g.fromTo('.send-dump', { scale: 0.85 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1, 0.45)', clearProps: 'transform' });
  }
}

$('#send-dump').addEventListener('click', addThought);
$('#dump-input').addEventListener('input', event => {
  event.target.style.height = 'auto';
  event.target.style.height = `${Math.min(event.target.scrollHeight, 62)}px`;
  const count = event.target.value.split(/[.!?,\n]+/).map(part => part.trim()).filter(Boolean).length;
  $('#dump-status').textContent = `${count} ${count === 1 ? 'thought' : 'thoughts'} ready`;
});
$('#dump-input').addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    addThought();
  }
});

document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    $('#search-input').focus();
  }
  if (event.key === 'Escape') closeModal();
});

$('#search-input').addEventListener('input', event => {
  const query = event.target.value.trim().toLowerCase();
  let visible = 0;
  $$('.thought-node').forEach(node => {
    const match = !query || node.textContent.toLowerCase().includes(query);
    node.classList.toggle('search-hidden', !match);
    if (match) visible++;
  });
  $('#visible-count').textContent = query ? `${visible} matches` : `${nodeCount()} thoughts`;
});

/* ---------- map transform: pan + zoom ---------- */
function updateMapTransform() {
  const zoom = Math.round(view.zoom);
  const transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom / 100})`;
  $('#node-layer').style.transform = transform;
  $('#connections').style.transform = transform;
  $('#zoom-level').textContent = `${zoom}%`;
  emit('transform', { x: view.x, y: view.y, zoom: view.zoom });
}
function changeZoom(amount) {
  const target = Math.max(70, Math.min(140, Math.round(view.zoom / 5) * 5 + amount));
  if (motion.on) {
    if (zoomTween) zoomTween.kill();
    zoomTween = motion.gsap.to(view, { zoom: target, duration: 0.35, ease: 'power2.out', onUpdate: updateMapTransform });
  } else {
    view.zoom = target;
    updateMapTransform();
  }
}
$('#zoom-in').addEventListener('click', () => changeZoom(10));
$('#zoom-out').addEventListener('click', () => changeZoom(-10));
stage.addEventListener('wheel', event => {
  if (event.target.closest('.dump-composer')) return;
  event.preventDefault();
  changeZoom(event.deltaY < 0 ? 5 : -5);
}, { passive: false });
stage.addEventListener('pointerdown', event => {
  if (event.target.closest('button, textarea')) return;
  dragState = { x: event.clientX, y: event.clientY, offsetX: view.x, offsetY: view.y };
  stage.setPointerCapture(event.pointerId);
  stage.classList.add('dragging');
});
stage.addEventListener('pointermove', event => {
  if (!dragState) return;
  view.x = dragState.offsetX + (event.clientX - dragState.x);
  view.y = dragState.offsetY + (event.clientY - dragState.y);
  updateMapTransform();
});
stage.addEventListener('pointerup', () => { dragState = null; stage.classList.remove('dragging'); });
stage.addEventListener('pointercancel', () => { dragState = null; stage.classList.remove('dragging'); });

/* ---------- toolbar ---------- */
$('#focus-button').addEventListener('click', () => {
  const active = document.body.classList.toggle('focus-active');
  $('#focus-button').innerHTML = active ? '<span>×</span> Exit focus' : '<span>◎</span> Focus mode';
  if (active) selectNode(selectedId, { silent: true });
  emit('focus', { active });
  showToast(active ? `Focused on ${nodeData[selectedId]?.title || 'your thought'}` : 'Full brain map restored', 'info');
});

const historyLabels = ['Today', '7 days ago', '30 days ago'];
$('#history-button').addEventListener('click', () => {
  historyIndex = (historyIndex + 1) % historyLabels.length;
  $('#history-label').textContent = historyLabels[historyIndex];
  stage.classList.toggle('history-muted', historyIndex > 0);
  emit('nudge', { amount: -0.6 });
  showToast(`Showing your brain from ${historyLabels[historyIndex].toLowerCase()}`, 'info');
});

$$('[data-map-mode]').forEach(tab => tab.addEventListener('click', () => {
  $$('[data-map-mode]').forEach(item => item.classList.remove('active'));
  tab.classList.add('active');
  const clusters = tab.dataset.mapMode === 'clusters';
  document.body.classList.toggle('cluster-mode', clusters);
  emit('nudge', { amount: clusters ? 1.4 : 1 });
  showToast(clusters ? 'Cluster view active' : 'Neural view active', 'info');
}));

$('#filter-button').addEventListener('click', () => {
  const active = document.body.classList.toggle('filter-active');
  showToast(active ? 'Showing active thoughts only' : 'All thought types visible', 'info');
});

/* ---------- modal ---------- */
function openModal(kind = 'next') {
  const modal = $('#modal-backdrop');
  if (kind === 'suggestion') {
    $('#modal-icon').textContent = '✦';
    $('#modal-eyebrow').textContent = 'AI SUGGESTION';
    $('#modal-title').textContent = 'Two thoughts want to connect';
    $('#modal-copy').textContent = 'BrainDump found a possible link. You are always in control of what becomes part of your map.';
    $('.next-task-card').innerHTML = '<div class="next-task-icon">⌁</div><div><span>Coding · related thought</span><strong>Launch checklist</strong><small>Added 3 days ago <b>•</b> Similar context</small></div><button id="start-next">Connect <span>→</span></button>';
    $('#modal-secondary').textContent = 'Ignore suggestion';
    $('#start-next').addEventListener('click', () => { closeModal(); emit('pulse', { color: 'violet', strength: 1.2 }); showToast('Thoughts connected'); }, { once: true });
  } else {
    $('#modal-icon').textContent = '⚡';
    $('#modal-eyebrow').textContent = 'NEXT UP';
    $('#modal-title').textContent = 'Your next best move';
    $('#modal-copy').textContent = 'Small progress compounds. Here’s one focused step to move your brain forward.';
    $('.next-task-card').innerHTML = '<div class="next-task-icon">∑</div><div><span>School <i>·</i> Tomorrow</span><strong>Review chapter 4 formulas</strong><small>About 25 minutes <b>•</b> High impact</small></div><button id="start-next">Start <span>→</span></button>';
    $('#modal-secondary').textContent = 'Maybe later';
    $('#start-next').addEventListener('click', () => { closeModal(); selectNode('math'); showToast('Focus session started'); }, { once: true });
  }
  modal.hidden = false;
  if (motion.on) {
    if (modalTween) modalTween.kill();
    modalTween = motion.gsap.timeline()
      .fromTo(modal, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power1.out' })
      .fromTo('.modal', { opacity: 0, y: 18, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'back.out(1.5)', clearProps: 'transform' }, '<')
      .from('.modal-icon', { scale: 0.4, rotate: -20, duration: 0.5, ease: 'back.out(2)', clearProps: 'transform' }, '-=0.3');
  }
}
function closeModal() {
  const modal = $('#modal-backdrop');
  if (modal.hidden) return;
  if (motion.on) {
    if (modalTween) modalTween.kill();
    modalTween = motion.gsap.timeline({ onComplete: () => { modal.hidden = true; motion.gsap.set([modal, '.modal'], { clearProps: 'all' }); } })
      .to('.modal', { opacity: 0, y: 10, scale: 0.96, duration: 0.2, ease: 'power2.in' })
      .to(modal, { opacity: 0, duration: 0.2 }, '<');
  } else {
    modal.hidden = true;
  }
}
$('#modal-close').addEventListener('click', closeModal);
$('#modal-secondary').addEventListener('click', closeModal);
$('#modal-backdrop').addEventListener('click', event => { if (event.target === event.currentTarget) closeModal(); });
$('#review-suggestion').addEventListener('click', () => openModal('suggestion'));

$('#notifications-button').addEventListener('click', () => showToast('You have 3 gentle reminders', 'info'));
$('#help-button').addEventListener('click', () => showToast('Tip: press ⌘ K to search your brain', 'info'));
$('#settings-button').addEventListener('click', () => showToast('Settings are coming to this local workspace', 'info'));
$('#add-space').addEventListener('click', () => showToast('New spaces will keep your brain beautifully focused', 'info'));
$$('.space-item').forEach(button => button.addEventListener('click', () => {
  $$('.space-item').forEach(item => item.classList.remove('selected-space'));
  button.classList.add('selected-space');
  const color = $('.space-dot', button)?.classList[1] || 'violet';
  emit('pulse', { color, strength: 0.7 });
  showToast(`${button.dataset.space} space selected`, 'info');
}));
$$('.nav-item[data-view]').forEach(button => button.addEventListener('click', () => {
  $$('.nav-item[data-view]').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  if (button.dataset.view !== 'brain-map') showToast(`${button.textContent.trim()} is ready to explore`, 'info');
}));

/* ---------- entrance ---------- */
function prepareLineDraw() {
  // the SVG is stretched (preserveAspectRatio="none"), so pad the dash so it always covers the path
  return $$('.connection-lines path').map(path => {
    const length = (path.getTotalLength ? path.getTotalLength() : 0) * 1.5;
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    return path;
  });
}

function runIntro() {
  const done = () => document.documentElement.classList.remove('is-loading');
  if (!motion.on) { done(); return; }

  const g = motion.gsap;
  const paths = prepareLineDraw();
  document.body.classList.add('is-entering'); // CSS transitions pause while GSAP drives the entrance
  const tl = g.timeline({ defaults: { ease: 'power3.out' }, onComplete: () => {
    $$('.connection-lines path').forEach(path => { path.style.strokeDasharray = ''; path.style.strokeDashoffset = ''; });
    document.body.classList.remove('is-entering');
  } });

  tl.from('.sidebar', { x: -24, opacity: 0, duration: 0.6 })
    .from('.sidebar .brand, .sidebar .workspace-label, .sidebar .nav-item, .sidebar .space-item, .sidebar .profile-card, .sidebar .local-badge', { y: 10, opacity: 0, stagger: 0.035, duration: 0.45, clearProps: 'transform' }, '-=0.4')
    .from('.topbar', { y: -14, opacity: 0, duration: 0.5 }, '-=0.6')
    .from('.map-toolbar', { y: -10, opacity: 0, duration: 0.45 }, '-=0.4')
    .from('.brain-stage', { scale: 0.985, opacity: 0, duration: 0.7, clearProps: 'transform' }, '-=0.45')
    .from('.brain-core', { scale: 0.6, opacity: 0, duration: 1, ease: 'back.out(1.6)', clearProps: 'transform,opacity' }, '-=0.35')
    .to(paths, { strokeDashoffset: 0, duration: 1.1, stagger: 0.04, ease: 'power2.inOut' }, '-=0.8')
    .from('.thought-node', { opacity: 0, duration: 0.5, stagger: { each: 0.045, from: 'center' }, clearProps: 'opacity' }, '-=1')
    .from('.thought-node .node-icon', { scale: 0, duration: 0.7, ease: 'back.out(2)', stagger: { each: 0.045, from: 'center' }, clearProps: 'transform' }, '<')
    .from(['.map-status', '.map-hint', '.map-legend'], { opacity: 0, y: 8, stagger: 0.08, duration: 0.4, clearProps: 'transform,opacity' }, '-=0.7')
    .from('.dump-composer', { y: 30, opacity: 0, duration: 0.6, clearProps: 'transform,opacity' }, '-=0.6')
    .from('.detail-panel', { x: 30, opacity: 0, duration: 0.6, clearProps: 'transform,opacity' }, '-=0.8')
    .from('.bottom-stats > div', { y: 10, opacity: 0, stagger: 0.05, duration: 0.4, clearProps: 'transform,opacity' }, '-=0.6');

  // initial states are applied synchronously by the from() tweens — safe to reveal now
  done();

  const counter = { value: 0 };
  g.to(counter, { value: nodeCount(), duration: 1.8, ease: 'power2.out', delay: 0.6, onUpdate: () => setCountLabels(counter.value) });
}

setCountLabels(nodeCount());
selectNode('website', { silent: true });
// on compact screens the panel is an overlay — keep the map visible until a thought is tapped
if (window.matchMedia('(max-width: 1120px)').matches) detailPanel.classList.add('closed');
runIntro();
