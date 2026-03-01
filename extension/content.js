(function () {
  'use strict';
  if (window.__nerExtLoaded) return;
  window.__nerExtLoaded = true;

  const DEFAULT_ENTITIES = [
    { name: 'PERSON',   color: '#e74c3c' },
    { name: 'ORG',      color: '#3498db' },
    { name: 'LOCATION', color: '#2ecc71' },
    { name: 'DATE',     color: '#f39c12' },
    { name: 'EVENT',    color: '#9b59b6' }
  ];

  let entityTypes = [];
  let currentRange = null;

  /* ── storage helpers ── */
  function loadEntities(cb) {
    chrome.storage.local.get('nerEntities', r => {
      entityTypes = (r.nerEntities && r.nerEntities.length) ? r.nerEntities : DEFAULT_ENTITIES;
      cb && cb();
    });
  }

  function saveAnnotation(text, entity) {
    const url = location.href;
    chrome.storage.local.get('nerAnnotations', r => {
      const all = r.nerAnnotations || {};
      if (!all[url]) all[url] = [];
      all[url].push({ text, entity: entity.name, color: entity.color, ts: Date.now() });
      chrome.storage.local.set({ nerAnnotations: all });
    });
  }

  /* ── toolbar ── */
  function getToolbar() {
    let t = document.getElementById('ner-ext-toolbar');
    if (!t) {
      t = document.createElement('div');
      t.id = 'ner-ext-toolbar';
      document.documentElement.appendChild(t);
    }
    return t;
  }

  function contrast(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#000' : '#fff';
  }

  function showToolbar(rect) {
    const t = getToolbar();
    t.innerHTML = '';

    entityTypes.forEach(entity => {
      const btn = document.createElement('button');
      btn.className = 'ner-ext-btn';
      btn.textContent = entity.name;
      btn.style.cssText = `background:${entity.color};color:${contrast(entity.color)}`;
      btn.addEventListener('mousedown', e => { e.preventDefault(); applyLabel(entity); });
      btn.addEventListener('touchstart', e => { e.preventDefault(); applyLabel(entity); }, { passive: false });
      t.appendChild(btn);
    });

    const x = document.createElement('button');
    x.className = 'ner-ext-btn ner-ext-close';
    x.textContent = '✕';
    x.addEventListener('mousedown', e => { e.preventDefault(); hideToolbar(); });
    x.addEventListener('touchstart', e => { e.preventDefault(); hideToolbar(); }, { passive: false });
    t.appendChild(x);

    t.style.display = 'flex';

    // position above selection, clamped to viewport
    const sx = window.scrollX, sy = window.scrollY;
    const tw = t.offsetWidth || 300;
    const th = t.offsetHeight || 40;
    let top  = rect.top  + sy - th - 10;
    let left = rect.left + sx + rect.width / 2 - tw / 2;
    if (top < sy + 8) top = rect.bottom + sy + 10;
    left = Math.max(sx + 8, Math.min(left, sx + window.innerWidth - tw - 8));
    t.style.top  = top  + 'px';
    t.style.left = left + 'px';
  }

  function hideToolbar() {
    const t = document.getElementById('ner-ext-toolbar');
    if (t) t.style.display = 'none';
    currentRange = null;
  }

  /* ── label application ── */
  function applyLabel(entity) {
    if (!currentRange) return;
    try {
      const span = document.createElement('mark');
      span.className = 'ner-ext-label';
      span.dataset.entity = entity.name;
      span.style.cssText = `background:${entity.color}33;border-bottom:2px solid ${entity.color};cursor:pointer;border-radius:3px;padding:0 2px`;
      span.title = entity.name;
      currentRange.surroundContents(span);
      span.addEventListener('click', e => { e.stopPropagation(); showRemoveMenu(span, e); });
      saveAnnotation(span.textContent, entity);
    } catch (_) {
      // selection spans element boundaries — skip
    }
    hideToolbar();
    window.getSelection().removeAllRanges();
  }

  /* ── remove menu ── */
  function showRemoveMenu(span, event) {
    removeMenu();
    const menu = document.createElement('div');
    menu.id = 'ner-ext-menu';
    menu.innerHTML = `<span class="ner-ext-menu-name">${span.dataset.entity}</span>
      <button class="ner-ext-btn ner-ext-remove-btn">Remove</button>`;
    menu.querySelector('.ner-ext-remove-btn').addEventListener('click', () => {
      unlabel(span); removeMenu();
    });
    document.documentElement.appendChild(menu);
    const r = span.getBoundingClientRect();
    menu.style.top  = (r.bottom + window.scrollY + 4) + 'px';
    menu.style.left = (r.left   + window.scrollX)     + 'px';
    menu.style.display = 'flex';
    setTimeout(() => document.addEventListener('click', removeMenu, { once: true }), 0);
  }

  function removeMenu() {
    const m = document.getElementById('ner-ext-menu');
    if (m) m.remove();
  }

  function unlabel(span) {
    const p = span.parentNode;
    while (span.firstChild) p.insertBefore(span.firstChild, span);
    p.removeChild(span);
    p.normalize();
  }

  /* ── selection listeners ── */
  function onSelectionEnd() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) { hideToolbar(); return; }
    currentRange = sel.getRangeAt(0).cloneRange();
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    loadEntities(() => showToolbar(rect));
  }

  document.addEventListener('mouseup', e => {
    if (e.target.closest('#ner-ext-toolbar,#ner-ext-menu')) return;
    setTimeout(onSelectionEnd, 10);
  });

  document.addEventListener('touchend', e => {
    if (e.target.closest('#ner-ext-toolbar,#ner-ext-menu')) return;
    setTimeout(onSelectionEnd, 300);
  });

  document.addEventListener('mousedown', e => {
    if (e.target.closest('#ner-ext-toolbar,#ner-ext-menu,.ner-ext-label')) return;
    hideToolbar();
    removeMenu();
  });

  loadEntities();
})();
