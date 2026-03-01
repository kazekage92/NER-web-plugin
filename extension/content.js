(function () {
  'use strict';
  if (window.__nerExtLoaded) return;
  window.__nerExtLoaded = true;

  /* ── entity type config ── */
  const DEFAULT_ENTITIES = [
    { name: 'PERSON',   color: '#e74c3c' },
    { name: 'ORG',      color: '#3498db' },
    { name: 'LOCATION', color: '#2ecc71' },
    { name: 'DATE',     color: '#f39c12' },
    { name: 'MONEY',    color: '#9b59b6' }
  ];

  let entityTypes = [];
  let currentRange = null;

  function getColor(typeName) {
    const e = entityTypes.find(e => e.name === typeName);
    return e ? e.color : '#aaaaaa';
  }

  /* ── storage ── */
  function loadEntities(cb) {
    chrome.storage.local.get('nerEntities', r => {
      entityTypes = (r.nerEntities && r.nerEntities.length) ? r.nerEntities : DEFAULT_ENTITIES;
      cb && cb();
    });
  }

  function saveAnnotation(text, type, url) {
    chrome.storage.local.get('nerAnnotations', r => {
      const all = r.nerAnnotations || {};
      if (!all[url]) all[url] = [];
      all[url].push({ text, entity: type, color: getColor(type), ts: Date.now(), auto: true });
      chrome.storage.local.set({ nerAnnotations: all });
    });
  }

  /* ── DOM text-node highlighting ── */
  const SKIP_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT','CODE','PRE','SELECT','OPTION','IFRAME','SVG','CANVAS','BUTTON']);

  function getTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.closest('mark.ner-ext-label,#ner-ext-toolbar,#ner-ext-menu')) return NodeFilter.FILTER_REJECT;
        if (node.textContent.trim().length < 3) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function highlightTextNode(textNode, matches) {
    if (!matches.length) return;
    const text = textNode.textContent;
    const frag = document.createDocumentFragment();
    let last = 0;

    for (const m of matches) {
      if (m.start < last) continue;
      if (m.start > last) frag.appendChild(document.createTextNode(text.slice(last, m.start)));

      const color = getColor(m.type);
      const mark = document.createElement('mark');
      mark.className = 'ner-ext-label';
      mark.dataset.entity = m.type;
      mark.style.cssText = `background:${color}2e;border-bottom:2px solid ${color};cursor:pointer;border-radius:3px;padding:0 2px`;
      mark.title = m.type;
      mark.textContent = text.slice(m.start, m.end);
      mark.addEventListener('click', e => { e.stopPropagation(); showRemoveMenu(mark, e); });
      frag.appendChild(mark);
      last = m.end;
    }

    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.parentNode.replaceChild(frag, textNode);
  }

  /* ── auto scan ── */
  let scanDone = false;

  function autoScan() {
    if (scanDone) return;
    scanDone = true;

    loadEntities(() => {
      const textNodes = getTextNodes(document.body);
      const url = location.href;

      // Process in small batches to avoid freezing the page
      let i = 0;
      function batch() {
        const end = Math.min(i + 50, textNodes.length);
        for (; i < end; i++) {
          const node = textNodes[i];
          if (!node.parentNode) continue; // already replaced
          const matches = window.NEREngine.detect(node.textContent);
          if (matches.length) {
            highlightTextNode(node, matches);
            matches.forEach(m => saveAnnotation(m.text || '', m.type, url));
          }
        }
        if (i < textNodes.length) requestAnimationFrame(batch);
      }
      requestAnimationFrame(batch);
    });
  }

  /* ── manual selection toolbar ── */
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
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return (0.299*r + 0.587*g + 0.114*b)/255 > 0.55 ? '#000' : '#fff';
  }

  function showToolbar(rect) {
    const t = getToolbar();
    t.innerHTML = '';
    entityTypes.forEach(entity => {
      const btn = document.createElement('button');
      btn.className = 'ner-ext-btn';
      btn.textContent = entity.name;
      btn.style.cssText = `background:${entity.color};color:${contrast(entity.color)}`;
      btn.addEventListener('mousedown', e => { e.preventDefault(); applyManualLabel(entity); });
      btn.addEventListener('touchstart', e => { e.preventDefault(); applyManualLabel(entity); }, { passive:false });
      t.appendChild(btn);
    });
    const x = document.createElement('button');
    x.className = 'ner-ext-btn ner-ext-close';
    x.textContent = '✕';
    x.addEventListener('mousedown', e => { e.preventDefault(); hideToolbar(); });
    t.appendChild(x);
    t.style.display = 'flex';

    const sx = window.scrollX, sy = window.scrollY;
    const tw = t.offsetWidth || 320, th = t.offsetHeight || 40;
    let top  = rect.top + sy - th - 10;
    let left = rect.left + sx + rect.width/2 - tw/2;
    if (top < sy+8) top = rect.bottom + sy + 10;
    left = Math.max(sx+8, Math.min(left, sx+window.innerWidth-tw-8));
    t.style.top = top+'px';
    t.style.left = left+'px';
  }

  function hideToolbar() {
    const t = document.getElementById('ner-ext-toolbar');
    if (t) t.style.display = 'none';
    currentRange = null;
  }

  function applyManualLabel(entity) {
    if (!currentRange) return;
    try {
      const mark = document.createElement('mark');
      mark.className = 'ner-ext-label';
      mark.dataset.entity = entity.name;
      mark.style.cssText = `background:${entity.color}2e;border-bottom:2px solid ${entity.color};cursor:pointer;border-radius:3px;padding:0 2px`;
      mark.title = entity.name;
      currentRange.surroundContents(mark);
      mark.addEventListener('click', e => { e.stopPropagation(); showRemoveMenu(mark, e); });
      saveAnnotation(mark.textContent, entity.name, location.href);
    } catch (_) { /* cross-element selection */ }
    hideToolbar();
    window.getSelection().removeAllRanges();
  }

  /* ── remove menu ── */
  function removeMenu() {
    const m = document.getElementById('ner-ext-menu');
    if (m) m.remove();
  }

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
    menu.style.top  = (r.bottom + window.scrollY + 4)+'px';
    menu.style.left = (r.left   + window.scrollX)+'px';
    menu.style.display = 'flex';
    setTimeout(() => document.addEventListener('click', removeMenu, { once:true }), 0);
  }

  function unlabel(span) {
    const p = span.parentNode;
    while (span.firstChild) p.insertBefore(span.firstChild, span);
    p.removeChild(span);
    p.normalize();
  }

  /* ── manual selection listeners ── */
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
    hideToolbar(); removeMenu();
  });

  /* ── listen for popup commands ── */
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'rescan') { scanDone = false; autoScan(); }
    if (msg.action === 'clearHighlights') {
      document.querySelectorAll('mark.ner-ext-label').forEach(m => unlabel(m));
      scanDone = false;
    }
  });

  /* ── boot: auto-scan after page is ready ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoScan);
  } else {
    // Small delay so page content renders first
    setTimeout(autoScan, 600);
  }

})();
