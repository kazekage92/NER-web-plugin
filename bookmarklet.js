/* NER Entity Labeler — bookmarklet bundle (no Chrome APIs, uses localStorage) */
(function () {
  'use strict';
  if (window.__nerBMLoaded) { window.__nerBMRescan && window.__nerBMRescan(); return; }
  window.__nerBMLoaded = true;

  /* ── NER engine (inline) ── */
  const DATE_RE = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember))\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b|\b(?:Q[1-4]|H[12])\s+\d{4}\b/gi;
  const MONEY_RE = /\$\s*[\d,]+(?:\.\d{1,2})?(?:\s*(?:million|billion|trillion|[MBT]))?\b|\b[\d,]+(?:\.\d{1,2})?\s*(?:million|billion|trillion)?\s*(?:USD|EUR|GBP|JPY|CAD|AUD|dollars?|euros?|pounds?|yuan|yen)\b/gi;
  const ORG_RE = /\b(?:[A-Z][a-zA-Z&'\-]+(?:\s+[A-Z][a-zA-Z&'\-]+)*\s+(?:Inc\.?|Corp\.?|Ltd\.?|LLC|LLP|PLC|Co\.?|Company|Group|Holdings?|Foundation|Institute|University|College|School|Hospital|Bank|Fund|Trust|Association|Federation|Union|Alliance|Organization|Department|Agency|Bureau|Ministry|Commission|Council|Authority|Corporation|Industries|International|Global|National|Systems?|Solutions?|Technologies?|Services?|Networks?|Labs?|Media|Press|Times|Post|Capital))\b/g;
  const ACRONYM_SKIP = new Set(['IS','IT','AN','IN','ON','AT','OR','TO','OF','AS','BY','SO','IF','UP','US','UK','EU','UN','WHO','HOW','WHY','THE','AND','FOR','BUT','NOT','ARE','WAS','HAS']);
  const FIRST_NAMES = new Set(['James','John','Robert','Michael','William','David','Richard','Joseph','Thomas','Charles','Christopher','Daniel','Matthew','Anthony','Mark','Donald','Steven','Paul','Andrew','Joshua','Kenneth','Kevin','Brian','George','Timothy','Ronald','Edward','Jason','Jeffrey','Ryan','Jacob','Gary','Nicholas','Eric','Jonathan','Stephen','Larry','Justin','Scott','Brandon','Benjamin','Samuel','Raymond','Frank','Alexander','Patrick','Jack','Tyler','Aaron','Jose','Adam','Henry','Nathan','Peter','Kyle','Ethan','Jeremy','Keith','Noah','Carl','Sean','Austin','Arthur','Jesse','Dylan','Bryan','Victor','Ivan','Harry','Jimmy','Todd','Mary','Patricia','Jennifer','Linda','Barbara','Elizabeth','Susan','Jessica','Sarah','Karen','Lisa','Nancy','Betty','Margaret','Sandra','Ashley','Dorothy','Kimberly','Emily','Donna','Michelle','Carol','Amanda','Melissa','Deborah','Stephanie','Rebecca','Sharon','Laura','Cynthia','Amy','Angela','Anna','Brenda','Emma','Nicole','Helen','Samantha','Katherine','Christine','Rachel','Carolyn','Janet','Catherine','Maria','Heather','Diane','Julie','Victoria','Ruth','Lauren','Kelly','Christina','Joan','Evelyn','Andrea','Hannah','Megan','Martha','Madison','Teresa','Sara','Sophia','Julia','Grace','Charlotte','Natalie','Diana','Olivia','Ava','Mia','Chloe','Ella','Zoe','Lily','Liam','Noah','Oliver','Elijah','Aiden','Lucas','Mason','Asher','Leo','Mohammed','Muhammad','Ali','Omar','Ahmed','Hassan','Ibrahim','Fatima','Aisha','Pierre','Jean','Marie','Francois','Sophie','Nicolas','Hans','Klaus','Stefan','Carlos','Miguel','Diego','Sofia','Valentina','Sebastian','Mateo','Boris','Dmitri','Natasha','Alexei','Sergei','Raj','Priya','Amit','Rahul','Pooja','Arjun']);
  const COUNTRIES = new Set(['Afghanistan','Albania','Algeria','Angola','Argentina','Armenia','Australia','Austria','Azerbaijan','Bangladesh','Belarus','Belgium','Bolivia','Brazil','Bulgaria','Cambodia','Cameroon','Canada','Chile','China','Colombia','Croatia','Cuba','Denmark','Ecuador','Egypt','Ethiopia','Finland','France','Georgia','Germany','Ghana','Greece','Guatemala','Hungary','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Japan','Jordan','Kazakhstan','Kenya','Kuwait','Lebanon','Libya','Malaysia','Mexico','Morocco','Myanmar','Nepal','Netherlands','Nigeria','Norway','Pakistan','Peru','Philippines','Poland','Portugal','Romania','Russia','Saudi Arabia','Serbia','Singapore','Somalia','Spain','Sudan','Sweden','Switzerland','Syria','Taiwan','Tanzania','Thailand','Tunisia','Turkey','Uganda','Ukraine','Vietnam','Yemen','Zimbabwe','United States','United Kingdom','United Arab Emirates','South Africa','South Korea','North Korea','New Zealand','Hong Kong','Sri Lanka']);
  const GEO_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|Avenue|Boulevard|Road|Drive|Lane|Park|Square|Bridge|River|Lake|Sea|Ocean|Mountain|Bay|Island|Valley|Desert|Beach|Harbor|Port|Airport|Station|District|County|Province|Region|Territory|City|Town|Village|Gulf)\b/g;

  function detect(text) {
    const res = [];
    function add(re, type) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null)
        res.push({ start: m.index, end: m.index + m[0].length, type });
    }
    add(DATE_RE, 'DATE');
    add(MONEY_RE, 'MONEY');
    add(ORG_RE, 'ORG');

    // Acronyms
    const aRe = /\b[A-Z]{2,5}\b/g;
    let m;
    while ((m = aRe.exec(text)) !== null)
      if (!ACRONYM_SKIP.has(m[0])) res.push({ start: m.index, end: m.index + m[0].length, type: 'ORG' });

    // Persons
    const pRe = /\b([A-Z][a-z]{1,15})(?:\s+[A-Z][a-z]{1,15}){1,3}\b/g;
    while ((m = pRe.exec(text)) !== null)
      if (FIRST_NAMES.has(m[0].split(' ')[0])) res.push({ start: m.index, end: m.index + m[0].length, type: 'PERSON' });

    // Countries
    COUNTRIES.forEach(c => {
      const re = new RegExp(`\\b${c.replace(/\s/g, '\\s+')}\\b`, 'g');
      while ((m = re.exec(text)) !== null) res.push({ start: m.index, end: m.index + m[0].length, type: 'LOCATION' });
    });

    // Geo suffixes
    GEO_RE.lastIndex = 0;
    while ((m = GEO_RE.exec(text)) !== null) res.push({ start: m.index, end: m.index + m[0].length, type: 'LOCATION' });

    // Sort & dedup
    res.sort((a, b) => a.start - b.start || b.end - a.end);
    const out = []; let last = -1;
    for (const r of res) { if (r.start >= last) { out.push(r); last = r.end; } }
    return out;
  }

  /* ── entity colors ── */
  const COLORS = { PERSON: '#e74c3c', ORG: '#3498db', LOCATION: '#2ecc71', DATE: '#f39c12', MONEY: '#9b59b6' };

  /* ── inject CSS ── */
  if (!document.getElementById('ner-bm-style')) {
    const style = document.createElement('style');
    style.id = 'ner-bm-style';
    style.textContent = `
      #ner-bm-toolbar{position:fixed!important;z-index:2147483647!important;top:12px!important;right:12px!important;
        display:flex;flex-wrap:wrap;gap:5px;padding:8px 10px;background:#1a1a2e;border-radius:10px;
        box-shadow:0 4px 20px rgba(0,0,0,.5);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:320px}
      #ner-bm-toolbar button{padding:5px 10px;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:.4px}
      #ner-bm-menu{position:absolute!important;z-index:2147483647!important;display:none;align-items:center;gap:8px;
        padding:6px 10px;background:#1a1a2e;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.45);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      #ner-bm-menu span{color:#fff;font-size:12px;font-weight:600}
      #ner-bm-menu button{padding:3px 9px;border:none;border-radius:4px;background:#e74c3c;color:#fff;font-size:11px;font-weight:700;cursor:pointer}
      mark.ner-bm-label{background:inherit;color:inherit;border-radius:3px;padding:0 2px;cursor:pointer}
    `;
    document.head.appendChild(style);
  }

  /* ── floating toolbar (manual selection) ── */
  let currentRange = null;

  function buildToolbar() {
    let t = document.getElementById('ner-bm-toolbar');
    if (t) return t;
    t = document.createElement('div');
    t.id = 'ner-bm-toolbar';

    const title = document.createElement('span');
    title.textContent = 'NER';
    title.style.cssText = 'color:#667;font-size:11px;font-weight:700;align-self:center;margin-right:2px';
    t.appendChild(title);

    Object.entries(COLORS).forEach(([name, color]) => {
      const btn = document.createElement('button');
      btn.textContent = name;
      btn.style.cssText = `background:${color};color:${contrast(color)}`;
      btn.addEventListener('mousedown', e => { e.preventDefault(); applyLabel(name, color); });
      btn.addEventListener('touchstart', e => { e.preventDefault(); applyLabel(name, color); }, { passive: false });
      t.appendChild(btn);
    });

    const scanBtn = document.createElement('button');
    scanBtn.textContent = 'Scan';
    scanBtn.style.cssText = 'background:#2ecc71;color:#000';
    scanBtn.addEventListener('click', () => { clearHighlights(); runScan(); });
    t.appendChild(scanBtn);

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.cssText = 'background:#444;color:#fff';
    clearBtn.addEventListener('click', clearHighlights);
    t.appendChild(clearBtn);

    document.documentElement.appendChild(t);
    return t;
  }

  function contrast(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return (0.299*r+0.587*g+0.114*b)/255 > 0.55 ? '#000' : '#fff';
  }

  /* ── label application ── */
  function applyLabel(type, color) {
    if (!currentRange) return;
    try {
      const mark = document.createElement('mark');
      mark.className = 'ner-bm-label';
      mark.dataset.entity = type;
      mark.style.cssText = `background:${color}2e;border-bottom:2px solid ${color}`;
      mark.title = type;
      currentRange.surroundContents(mark);
      mark.addEventListener('click', e => { e.stopPropagation(); showRemoveMenu(mark, e); });
    } catch (_) {}
    window.getSelection().removeAllRanges();
    currentRange = null;
  }

  function showRemoveMenu(span, e) {
    hideRemoveMenu();
    const menu = document.createElement('div');
    menu.id = 'ner-bm-menu';
    menu.innerHTML = `<span>${span.dataset.entity}</span><button>Remove</button>`;
    menu.querySelector('button').addEventListener('click', () => { unlabel(span); hideRemoveMenu(); });
    document.documentElement.appendChild(menu);
    const r = span.getBoundingClientRect();
    menu.style.top  = (r.bottom + window.scrollY + 4) + 'px';
    menu.style.left = (r.left   + window.scrollX) + 'px';
    menu.style.display = 'flex';
    setTimeout(() => document.addEventListener('click', hideRemoveMenu, { once: true }), 0);
  }

  function hideRemoveMenu() {
    const m = document.getElementById('ner-bm-menu');
    if (m) m.remove();
  }

  function unlabel(span) {
    const p = span.parentNode;
    while (span.firstChild) p.insertBefore(span.firstChild, span);
    p.removeChild(span);
    p.normalize();
  }

  function clearHighlights() {
    document.querySelectorAll('mark.ner-bm-label').forEach(m => unlabel(m));
  }

  /* ── selection listeners ── */
  document.addEventListener('mouseup', e => {
    if (e.target.closest('#ner-bm-toolbar,#ner-bm-menu')) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
      currentRange = sel.getRangeAt(0).cloneRange();
    }, 10);
  });
  document.addEventListener('touchend', e => {
    if (e.target.closest('#ner-bm-toolbar,#ner-bm-menu')) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
      currentRange = sel.getRangeAt(0).cloneRange();
    }, 300);
  });

  /* ── auto-scan ── */
  const SKIP_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT','CODE','PRE','SELECT','IFRAME','SVG','CANVAS','BUTTON']);

  function getTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.closest('mark.ner-bm-label,#ner-bm-toolbar,#ner-bm-menu')) return NodeFilter.FILTER_REJECT;
        if (node.textContent.trim().length < 3) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function highlightTextNode(textNode, matches) {
    const text = textNode.textContent;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of matches) {
      if (m.start < last) continue;
      if (m.start > last) frag.appendChild(document.createTextNode(text.slice(last, m.start)));
      const color = COLORS[m.type] || '#aaa';
      const mark = document.createElement('mark');
      mark.className = 'ner-bm-label';
      mark.dataset.entity = m.type;
      mark.style.cssText = `background:${color}2e;border-bottom:2px solid ${color}`;
      mark.title = m.type;
      mark.textContent = text.slice(m.start, m.end);
      mark.addEventListener('click', ev => { ev.stopPropagation(); showRemoveMenu(mark, ev); });
      frag.appendChild(mark);
      last = m.end;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.parentNode.replaceChild(frag, textNode);
  }

  function runScan() {
    const nodes = getTextNodes(document.body);
    let i = 0;
    function batch() {
      const end = Math.min(i + 50, nodes.length);
      for (; i < end; i++) {
        const node = nodes[i];
        if (!node.parentNode) continue;
        const matches = detect(node.textContent);
        if (matches.length) highlightTextNode(node, matches);
      }
      if (i < nodes.length) requestAnimationFrame(batch);
    }
    requestAnimationFrame(batch);
  }

  /* ── boot ── */
  buildToolbar();
  runScan();

  // expose for re-tap
  window.__nerBMRescan = () => { clearHighlights(); runScan(); };
})();
