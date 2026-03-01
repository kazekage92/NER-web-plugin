'use strict';

const DEFAULT_ENTITIES = [
  { name: 'PERSON',   color: '#e74c3c' },
  { name: 'ORG',      color: '#3498db' },
  { name: 'LOCATION', color: '#2ecc71' },
  { name: 'DATE',     color: '#f39c12' },
  { name: 'EVENT',    color: '#9b59b6' }
];

let entities = [];

function save() {
  chrome.storage.local.set({ nerEntities: entities }, renderEntities);
}

function renderEntities() {
  const list = document.getElementById('entity-list');
  list.innerHTML = '';
  if (!entities.length) {
    list.innerHTML = '<p class="empty">No entity types.</p>';
    return;
  }
  entities.forEach((e, i) => {
    const row = document.createElement('div');
    row.className = 'entity-row';
    row.innerHTML = `
      <div class="entity-swatch" style="background:${e.color}"></div>
      <span class="entity-name">${e.name}</span>
      <button class="btn-remove" data-i="${i}" title="Remove">✕</button>`;
    row.querySelector('.btn-remove').addEventListener('click', () => {
      entities.splice(i, 1);
      save();
    });
    list.appendChild(row);
  });
}

function renderStats() {
  chrome.storage.local.get('nerAnnotations', r => {
    const all = r.nerAnnotations || {};
    const pages = Object.keys(all).length;
    const total = Object.values(all).reduce((s, arr) => s + arr.length, 0);
    document.getElementById('stat').innerHTML =
      `<span>${total}</span> annotation${total !== 1 ? 's' : ''} across <span>${pages}</span> page${pages !== 1 ? 's' : ''}`;
  });
}

document.getElementById('btn-add').addEventListener('click', () => {
  const name  = document.getElementById('new-name').value.trim().toUpperCase();
  const color = document.getElementById('new-color').value;
  if (!name) return;
  if (entities.find(e => e.name === name)) return;
  entities.push({ name, color });
  document.getElementById('new-name').value = '';
  save();
});

document.getElementById('new-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-add').click();
});

document.getElementById('btn-export').addEventListener('click', () => {
  chrome.storage.local.get('nerAnnotations', r => {
    const blob = new Blob([JSON.stringify(r.nerAnnotations || {}, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ner-annotations-${Date.now()}.json`;
    a.click();
  });
});

document.getElementById('btn-clear').addEventListener('click', () => {
  if (!confirm('Clear ALL annotations?')) return;
  chrome.storage.local.remove('nerAnnotations', renderStats);
});

// init
chrome.storage.local.get('nerEntities', r => {
  entities = (r.nerEntities && r.nerEntities.length) ? r.nerEntities : [...DEFAULT_ENTITIES];
  renderEntities();
});
renderStats();
