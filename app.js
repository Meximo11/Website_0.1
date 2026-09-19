const nodeData = {
  core: { parent: 'Workspace', title: 'My Brain', status: 'Living map', progress: 100, tasks: [], notes: 'A gentle, visual home for everything you think about.', parentColor: 'violet' },
  school: { parent: 'My Brain', title: 'School', status: 'In progress', progress: 58, tasks: ['Math exam tomorrow', 'Review English vocabulary', 'Pack school bag'], notes: 'Keep the next step small. Future me will thank me.', parentColor: 'blue' },
  coding: { parent: 'My Brain', title: 'Coding', status: 'In progress', progress: 64, tasks: ['Ship the BrainDump prototype', 'Refactor graph interactions', 'Write a short launch note'], notes: 'Make useful things, then make them feel good.', parentColor: 'violet' },
  personal: { parent: 'My Brain', title: 'Personal', status: 'In progress', progress: 42, tasks: ['Clean up the desk', 'Plan the weekend'], notes: 'A little space creates a lot of clarity.', parentColor: 'orange' },
  ideas: { parent: 'My Brain', title: 'Ideas', status: 'Open', progress: 18, tasks: ['Capture the good ones', 'Pick one to explore'], notes: 'Not every idea needs to become a project today.', parentColor: 'orange' },
  math: { parent: 'School', title: 'Math exam', status: 'Deadline soon', progress: 35, tasks: ['Review chapter 4 formulas', 'Solve practice sheet'], notes: 'Tomorrow. Focus on formulas first, then practice.', parentColor: 'blue', deadline: true },
  english: { parent: 'School', title: 'English', status: 'Open', progress: 25, tasks: ['Learn vocabulary', 'Read one sample essay'], notes: 'Friday is close, but there is enough time.', parentColor: 'blue' },
  website: { parent: 'Coding', title: 'Website', status: 'In progress', progress: 80, tasks: ['Landing page structure', 'Set up navigation', 'Choose color system', 'Build brain map prototype', 'Polish the animations'], completed: 4, notes: 'The first version should feel calm and alive. Add subtle animations without distracting from the thought itself.', parentColor: 'violet' },
  godot: { parent: 'Coding', title: 'Godot', status: 'Open', progress: 36, tasks: ['Prototype player movement', 'Find a sound palette'], notes: 'A small experiment is enough for today.', parentColor: 'violet' },
  hotel: { parent: 'Personal', title: 'Hotel', status: 'Open', progress: 0, tasks: ['Compare two options'], notes: 'A quiet place with a good breakfast.', parentColor: 'orange' },
  budget: { parent: 'Personal', title: 'Budget', status: 'Open', progress: 20, tasks: ['Check subscriptions'], notes: 'Make the invisible visible once a month.', parentColor: 'orange' },
  training: { parent: 'Personal', title: 'Training', status: 'Open', progress: 50, tasks: ['Book a session'], notes: 'Consistency over intensity.', parentColor: 'violet' },
  travel: { parent: 'Personal', title: 'Travel', status: 'Open', progress: 15, tasks: ['Choose a weekend'], notes: 'Somewhere new, not necessarily far away.', parentColor: 'violet' }
};

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const stage = $('#brain-stage');
const detailPanel = $('#detail-panel');
let selectedId = 'website';
let zoom = 100;
let historyIndex = 0;
let toastTimer;
let customThoughts = Number(localStorage.getItem('braindump-custom-thoughts') || 0);
let mapOffset = { x: 0, y: 0 };
let dragState = null;

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

function updateCountLabels() {
  $('#thought-total').textContent = nodeCount();
  $('#visible-count').textContent = `${nodeCount()} thoughts`;
  $('.brain-core small').textContent = `${nodeCount()} thoughts`;
  $('.nav-count').textContent = nodeCount();
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

function selectNode(id) {
  const data = nodeData[id];
  if (!data) return;
  selectedId = id;
  $$('.thought-node, .brain-core').forEach(node => node.classList.toggle('selected', node.dataset.nodeId === id));
  $('#panel-parent').textContent = data.parent;
  $('#panel-title').textContent = data.title;
  $('#panel-status').textContent = data.status;
  $('#panel-progress-text').textContent = `${data.progress}%`;
  $('#panel-progress-bar').style.width = `${data.progress}%`;
  $('#notes-copy').textContent = data.notes;
  $('.active-pill').classList.toggle('deadline-pill', Boolean(data.deadline));
  $('.active-pill').classList.toggle('active-pill', !data.deadline);
  renderTasks(data);
  renderConnections(id);
  detailPanel.classList.remove('closed');
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
  if (node && selectedId !== 'core') node.remove();
  showToast(`${title} removed`, 'info');
  selectNode('core');
});

function addThought() {
  const input = $('#dump-input');
  const value = input.value.trim();
  if (!value) {
    input.focus();
    showToast('Write whatever is on your mind first', 'info');
    return;
  }
  const fragments = value.split(/[.!?]+/).map(part => part.trim()).filter(Boolean);
  const amount = Math.max(1, fragments.length);
  customThoughts += amount;
  localStorage.setItem('braindump-custom-thoughts', customThoughts);
  updateCountLabels();
  input.value = '';
  input.style.height = 'auto';
  $('#dump-status').textContent = '0 thoughts ready';
  showToast(`${amount} ${amount === 1 ? 'thought saved' : 'thoughts saved'} to your brain`);

  const newest = document.createElement('button');
  newest.className = 'thought-node tiny-node custom-node';
  newest.dataset.nodeId = `custom-${Date.now()}`;
  newest.innerHTML = `<span class="node-icon">✦</span><strong>${escapeHtml((fragments[0] || value).slice(0, 16))}${(fragments[0] || value).length > 16 ? '…' : ''}</strong><small>just now</small>`;
  newest.style.left = `${38 + Math.random() * 24}%`;
  newest.style.top = `${18 + Math.random() * 25}%`;
  $('#node-layer').appendChild(newest);
  newest.addEventListener('click', () => {
    nodeData[newest.dataset.nodeId] = { parent: 'Inbox', title: fragments[0] || value, status: 'New thought', progress: 0, tasks: [], notes: value, parentColor: 'violet' };
    selectNode(newest.dataset.nodeId);
  });
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

function updateMapTransform() {
  const transform = `translate(${mapOffset.x}px, ${mapOffset.y}px) scale(${zoom / 100})`;
  $('#node-layer').style.transform = transform;
  $('#connections').style.transform = transform;
  $('#zoom-level').textContent = `${zoom}%`;
}
function changeZoom(amount) {
  zoom = Math.max(70, Math.min(140, zoom + amount));
  updateMapTransform();
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
  dragState = { x: event.clientX, y: event.clientY, offsetX: mapOffset.x, offsetY: mapOffset.y };
  stage.setPointerCapture(event.pointerId);
  stage.classList.add('dragging');
});
stage.addEventListener('pointermove', event => {
  if (!dragState) return;
  mapOffset.x = dragState.offsetX + (event.clientX - dragState.x);
  mapOffset.y = dragState.offsetY + (event.clientY - dragState.y);
  updateMapTransform();
});
stage.addEventListener('pointerup', () => { dragState = null; stage.classList.remove('dragging'); });
stage.addEventListener('pointercancel', () => { dragState = null; stage.classList.remove('dragging'); });

$('#focus-button').addEventListener('click', () => {
  const active = document.body.classList.toggle('focus-active');
  $('#focus-button').innerHTML = active ? '<span>×</span> Exit focus' : '<span>◎</span> Focus mode';
  if (active) selectNode(selectedId);
  showToast(active ? `Focused on ${nodeData[selectedId]?.title || 'your thought'}` : 'Full brain map restored', 'info');
});

const historyLabels = ['Today', '7 days ago', '30 days ago'];
$('#history-button').addEventListener('click', () => {
  historyIndex = (historyIndex + 1) % historyLabels.length;
  $('#history-label').textContent = historyLabels[historyIndex];
  stage.classList.toggle('history-muted', historyIndex > 0);
  showToast(`Showing your brain from ${historyLabels[historyIndex].toLowerCase()}`, 'info');
});

$$('[data-map-mode]').forEach(tab => tab.addEventListener('click', () => {
  $$('[data-map-mode]').forEach(item => item.classList.remove('active'));
  tab.classList.add('active');
  document.body.classList.toggle('cluster-mode', tab.dataset.mapMode === 'clusters');
  showToast(tab.dataset.mapMode === 'clusters' ? 'Cluster view active' : 'Neural view active', 'info');
}));

$('#filter-button').addEventListener('click', () => {
  const active = document.body.classList.toggle('filter-active');
  showToast(active ? 'Showing active thoughts only' : 'All thought types visible', 'info');
});

function openModal(kind = 'next') {
  const modal = $('#modal-backdrop');
  if (kind === 'suggestion') {
    $('#modal-icon').textContent = '✦';
    $('#modal-eyebrow').textContent = 'AI SUGGESTION';
    $('#modal-title').textContent = 'Two thoughts want to connect';
    $('#modal-copy').textContent = 'BrainDump found a possible link. You are always in control of what becomes part of your map.';
    $('.next-task-card').innerHTML = '<div class="next-task-icon">⌁</div><div><span>Coding · related thought</span><strong>Launch checklist</strong><small>Added 3 days ago <b>•</b> Similar context</small></div><button id="start-next">Connect <span>→</span></button>';
    $('#modal-secondary').textContent = 'Ignore suggestion';
    $('#start-next').addEventListener('click', () => { closeModal(); showToast('Thoughts connected'); }, { once: true });
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
}
function closeModal() { $('#modal-backdrop').hidden = true; }
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
  showToast(`${button.dataset.space} space selected`, 'info');
}));
$$('.nav-item[data-view]').forEach(button => button.addEventListener('click', () => {
  $$('.nav-item[data-view]').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  if (button.dataset.view !== 'brain-map') showToast(`${button.textContent.trim()} is ready to explore`, 'info');
}));

updateCountLabels();
selectNode('website');
