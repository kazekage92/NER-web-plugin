/* NER Entity Labeler — bookmarklet bundle (no Chrome APIs, uses localStorage) */
(function () {
  'use strict';
  if (window.__nerBMLoaded) { window.__nerBMRescan && window.__nerBMRescan(); return; }
  window.__nerBMLoaded = true;

  /* ── NER engine ── */
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

    const aRe = /\b[A-Z]{2,5}\b/g;
    let m;
    while ((m = aRe.exec(text)) !== null)
      if (!ACRONYM_SKIP.has(m[0])) res.push({ start: m.index, end: m.index + m[0].length, type: 'ORG' });

    const pRe = /\b([A-Z][a-z]{1,15})(?:\s+[A-Z][a-z]{1,15}){1,3}\b/g;
    while ((m = pRe.exec(text)) !== null)
      if (FIRST_NAMES.has(m[0].split(' ')[0])) res.push({ start: m.index, end: m.index + m[0].length, type: 'PERSON' });

    COUNTRIES.forEach(c => {
      const re = new RegExp(`\\b${c.replace(/\s/g, '\\s+')}\\b`, 'g');
      while ((m = re.exec(text)) !== null) res.push({ start: m.index, end: m.index + m[0].length, type: 'LOCATION' });
    });

    GEO_RE.lastIndex = 0;
    while ((m = GEO_RE.exec(text)) !== null) res.push({ start: m.index, end: m.index + m[0].length, type: 'LOCATION' });

    res.sort((a, b) => a.start - b.start || b.end - a.end);
    const out = []; let last = -1;
    for (const r of res) { if (r.start >= last) { out.push(r); last = r.end; } }
    return out;
  }

  /* ── entity colors ── */
  const COLORS = { PERSON: '#e74c3c', ORG: '#3498db', LOCATION: '#2ecc71', DATE: '#f39c12', MONEY: '#9b59b6' };

  /* ── relation definitions: sorted type-pair → { label, color } ── */
  const RELATIONS = {
    'DATE+LOCATION':   { label: 'event_at',    color: '#95a5a6' },
    'DATE+MONEY':      { label: 'as_of',        color: '#e67e22' },
    'DATE+ORG':        { label: 'since',         color: '#d35400' },
    'DATE+PERSON':     { label: 'active_on',    color: '#8e44ad' },
    'LOCATION+MONEY':  { label: 'market_in',    color: '#16a085' },
    'LOCATION+ORG':    { label: 'based_in',     color: '#27ae60' },
    'LOCATION+PERSON': { label: 'located_in',   color: '#1abc9c' },
    'MONEY+ORG':       { label: 'valued_at',    color: '#2980b9' },
    'MONEY+PERSON':    { label: 'earns',         color: '#c0392b' },
    'ORG+PERSON':      { label: 'works_at',     color: '#e67e22' },
  };

  /* ── CSS ── */
  if (!document.getElementById('ner-bm-style')) {
    const style = document.createElement('style');
    style.id = 'ner-bm-style';
    style.textContent = `
      #ner-bm-toolbar{position:fixed!important;z-index:2147483647!important;top:12px!important;right:12px!important;
        display:flex;flex-wrap:wrap;gap:5px;padding:8px 10px;background:#1a1a2e;border-radius:10px;
        box-shadow:0 4px 20px rgba(0,0,0,.5);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:340px}
      #ner-bm-toolbar button{padding:5px 10px;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:.4px}
      #ner-bm-menu{position:absolute!important;z-index:2147483647!important;display:none;align-items:center;gap:8px;
        padding:6px 10px;background:#1a1a2e;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.45);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      #ner-bm-menu span{color:#fff;font-size:12px;font-weight:600}
      #ner-bm-menu button{padding:3px 9px;border:none;border-radius:4px;background:#e74c3c;color:#fff;font-size:11px;font-weight:700;cursor:pointer}
      mark.ner-bm-label{background:inherit;color:inherit;border-radius:3px;padding:0 2px;cursor:pointer}
      mark.ner-bm-label.ner-bm-hi{outline:2px solid #fff!important;outline-offset:1px}

      #ner-bm-svg{position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;
        pointer-events:none!important;z-index:2147483640!important;overflow:visible!important}

      #ner-bm-panel{position:fixed!important;z-index:2147483646!important;bottom:0!important;left:0!important;right:0!important;
        background:#1a1a2e;color:#eee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        box-shadow:0 -4px 24px rgba(0,0,0,.6);border-radius:14px 14px 0 0;
        max-height:60vh;display:flex;flex-direction:column;transition:transform .25s ease}
      #ner-bm-panel.collapsed{transform:translateY(calc(100% - 44px))}
      #ner-bm-panel-header{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;
        user-select:none;flex-shrink:0;border-bottom:1px solid #2a2a4a}
      #ner-bm-panel-header h3{margin:0;font-size:13px;font-weight:700;flex:1;color:#fff}
      #ner-bm-panel-header .ner-bm-badge{background:#3d5af1;color:#fff;border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700}
      #ner-bm-panel-header .ner-bm-toggle{color:#667;font-size:14px;transition:transform .2s}
      #ner-bm-panel:not(.collapsed) #ner-bm-panel-header .ner-bm-toggle{transform:rotate(180deg)}
      .ner-bm-tabs{display:flex;gap:2px;padding:6px 14px;flex-shrink:0;border-bottom:1px solid #1e1e3a}
      .ner-bm-tab{padding:5px 12px;border:none;border-radius:5px;font-size:12px;font-weight:700;
        cursor:pointer;background:transparent;color:#667;transition:all .15s}
      .ner-bm-tab.active{background:#2a2a4a;color:#eee}
      #ner-bm-panel-actions{display:flex;gap:8px;padding:6px 14px;flex-shrink:0;border-bottom:1px solid #1e1e3a}
      #ner-bm-panel-actions button{padding:5px 13px;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer}
      #ner-bm-panel-body{overflow-y:auto;padding:10px 14px 14px;flex:1}
      .ner-bm-group{margin-bottom:12px}
      .ner-bm-group-header{display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:4px 0}
      .ner-bm-group-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
      .ner-bm-group-name{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px}
      .ner-bm-group-count{font-size:11px;color:#667;margin-left:auto}
      .ner-bm-chips{display:flex;flex-wrap:wrap;gap:5px}
      .ner-bm-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;
        font-size:11px;cursor:pointer;border:1px solid transparent;transition:opacity .15s}
      .ner-bm-chip:hover{opacity:.8}
      .ner-bm-chip .ner-rm{font-size:10px;opacity:.6;margin-left:2px}
      .ner-bm-empty{color:#445;font-size:12px;text-align:center;padding:16px 0}
      .ner-bm-rel-row{display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #1e1e3a;font-size:11px;cursor:pointer}
      .ner-bm-rel-row:hover{background:#1e1e3a;margin:0 -4px;padding:4px 4px;border-radius:4px}
      .ner-bm-rel-from,.ner-bm-rel-to{padding:2px 6px;border-radius:3px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px}
      .ner-bm-rel-label{color:#fff;font-size:10px;background:#2a2a4a;border-radius:3px;padding:2px 5px;white-space:nowrap;flex-shrink:0}
      .ner-bm-rel-arrow{color:#445;flex-shrink:0}
    `;
    document.head.appendChild(style);
  }

  /* ── relation detection ── */
  let allRelations = [];

  function findRelations() {
    const BLOCK_SEL = 'p,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,figcaption';
    const blocks = document.querySelectorAll(BLOCK_SEL);
    const rels = [];
    const seen = new Set();

    blocks.forEach(block => {
      const marks = Array.from(block.querySelectorAll('mark.ner-bm-label'));
      if (marks.length < 2) return;
      for (let i = 0; i < marks.length; i++) {
        for (let j = i + 1; j < marks.length; j++) {
          const a = marks[i], b = marks[j];
          const ta = a.dataset.entity, tb = b.dataset.entity;
          if (ta === tb) continue;
          const key = [ta, tb].sort().join('+');
          const def = RELATIONS[key];
          if (!def) continue;
          const pairId = `${a.textContent.trim()}|${ta}::${b.textContent.trim()}|${tb}`;
          if (seen.has(pairId)) continue;
          seen.add(pairId);
          rels.push({ from: a, to: b, label: def.label, color: def.color,
                      fromType: ta, toType: tb });
        }
      }
    });
    return rels;
  }

  /* ── SVG overlay ── */
  let linesVisible = false;
  let drawPending = false;

  function getSVG() {
    let svg = document.getElementById('ner-bm-svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = 'ner-bm-svg';
      document.documentElement.appendChild(svg);
    }
    return svg;
  }

  function drawRelationLines() {
    const svg = getSVG();
    // clear previous
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!linesVisible || !allRelations.length) return;

    const vh = window.innerHeight;

    allRelations.forEach(rel => {
      const ra = rel.from.getBoundingClientRect();
      const rb = rel.to.getBoundingClientRect();
      // skip if both marks are off-screen
      if ((ra.bottom < 0 || ra.top > vh) && (rb.bottom < 0 || rb.top > vh)) return;
      // clamp to viewport
      const ax = ra.left + ra.width / 2,  ay = ra.top  + ra.height / 2;
      const bx = rb.left + rb.width / 2,  by = rb.top  + rb.height / 2;

      // arc control point: bow upward proportional to horizontal distance
      const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
      const bow = Math.max(22, Math.min(60, dx * 0.3 + dy * 0.15));
      const mx = (ax + bx) / 2;
      const my = Math.min(ay, by) - bow;

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

      // path
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${ax},${ay} Q${mx},${my} ${bx},${by}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', rel.color);
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('stroke-opacity', '0.65');
      path.setAttribute('stroke-dasharray', '5 3');
      g.appendChild(path);

      // arrowhead at destination
      const t = 0.95; // near end of bezier
      const qx = (1-t)*(1-t)*ax + 2*(1-t)*t*mx + t*t*bx;
      const qy = (1-t)*(1-t)*ay + 2*(1-t)*t*my + t*t*by;
      const angle = Math.atan2(by - qy, bx - qx) * 180 / Math.PI;
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      arrow.setAttribute('points', '0,-4 8,0 0,4');
      arrow.setAttribute('fill', rel.color);
      arrow.setAttribute('opacity', '0.7');
      arrow.setAttribute('transform', `translate(${bx},${by}) rotate(${angle})`);
      g.appendChild(arrow);

      // relation label background + text
      const lx = mx, ly = my - 5;
      const label = rel.label;
      const lw = label.length * 5.5 + 8;
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('x', lx - lw / 2); bg.setAttribute('y', ly - 10);
      bg.setAttribute('width', lw); bg.setAttribute('height', 13);
      bg.setAttribute('rx', '3'); bg.setAttribute('fill', '#1a1a2e');
      bg.setAttribute('opacity', '0.85');
      g.appendChild(bg);

      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', lx); txt.setAttribute('y', ly);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('font-size', '9');
      txt.setAttribute('font-family', '-apple-system,BlinkMacSystemFont,sans-serif');
      txt.setAttribute('fill', rel.color);
      txt.setAttribute('font-weight', '700');
      txt.textContent = label;
      g.appendChild(txt);

      svg.appendChild(g);
    });
  }

  function scheduleDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(() => { drawPending = false; drawRelationLines(); });
  }

  window.addEventListener('scroll', scheduleDraw, { passive: true });
  window.addEventListener('resize', scheduleDraw, { passive: true });

  /* ── floating toolbar ── */
  let currentRange = null;
  let linesBtn = null;

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

    linesBtn = document.createElement('button');
    linesBtn.textContent = 'Lines';
    linesBtn.style.cssText = 'background:#444;color:#fff';
    linesBtn.addEventListener('click', () => {
      linesVisible = !linesVisible;
      linesBtn.style.background = linesVisible ? '#e67e22' : '#444';
      linesBtn.style.color = '#fff';
      if (linesVisible && !allRelations.length) allRelations = findRelations();
      drawRelationLines();
    });
    t.appendChild(linesBtn);

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.cssText = 'background:#333;color:#fff';
    clearBtn.addEventListener('click', () => { clearHighlights(); allRelations = []; drawRelationLines(); refreshPanel(); });
    t.appendChild(clearBtn);

    document.documentElement.appendChild(t);
    return t;
  }

  function contrast(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return (0.299*r+0.587*g+0.114*b)/255 > 0.55 ? '#000' : '#fff';
  }

  /* ── annotations + relations panel ── */
  let activeTab = 'entities'; // 'entities' | 'relations'

  function buildPanel() {
    if (document.getElementById('ner-bm-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'ner-bm-panel';
    panel.classList.add('collapsed');

    panel.innerHTML = `
      <div id="ner-bm-panel-header">
        <h3>Annotations</h3>
        <span class="ner-bm-badge" id="ner-bm-total">0</span>
        <span class="ner-bm-toggle">▲</span>
      </div>
      <div class="ner-bm-tabs">
        <button class="ner-bm-tab active" data-tab="entities">Entities</button>
        <button class="ner-bm-tab" data-tab="relations">Relations <span id="ner-bm-rel-count" style="opacity:.6"></span></button>
      </div>
      <div id="ner-bm-panel-actions">
        <button id="ner-bm-export" style="background:#3d5af1;color:#fff">Export JSON</button>
        <button id="ner-bm-copy"   style="background:#2ecc71;color:#000">Copy JSON</button>
        <button id="ner-bm-dedup"  style="background:#444;color:#fff">Dedup</button>
      </div>
      <div id="ner-bm-panel-body"></div>
    `;
    document.documentElement.appendChild(panel);

    panel.querySelector('#ner-bm-panel-header').addEventListener('click', () => {
      panel.classList.toggle('collapsed');
    });

    panel.querySelectorAll('.ner-bm-tab').forEach(tab => {
      tab.addEventListener('click', e => {
        e.stopPropagation();
        activeTab = tab.dataset.tab;
        panel.querySelectorAll('.ner-bm-tab').forEach(t => t.classList.toggle('active', t === tab));
        renderPanelBody();
      });
    });

    panel.querySelector('#ner-bm-export').addEventListener('click', exportJSON);
    panel.querySelector('#ner-bm-copy').addEventListener('click', copyJSON);
    panel.querySelector('#ner-bm-dedup').addEventListener('click', dedupHighlights);
  }

  function collectAnnotations() {
    return Array.from(document.querySelectorAll('mark.ner-bm-label'))
      .map(m => ({ text: m.textContent.trim(), type: m.dataset.entity }));
  }

  function refreshPanel() {
    const totalBadge = document.getElementById('ner-bm-total');
    const relCount   = document.getElementById('ner-bm-rel-count');
    const annotations = collectAnnotations();
    if (totalBadge) totalBadge.textContent = annotations.length;
    if (relCount)   relCount.textContent   = allRelations.length ? `(${allRelations.length})` : '';
    renderPanelBody();

    const panel = document.getElementById('ner-bm-panel');
    if (panel && panel.classList.contains('collapsed') && annotations.length > 0)
      panel.classList.remove('collapsed');
  }

  function renderPanelBody() {
    const body = document.getElementById('ner-bm-panel-body');
    if (!body) return;
    body.innerHTML = '';
    if (activeTab === 'entities') renderEntities(body);
    else renderRelations(body);
  }

  function renderEntities(body) {
    const annotations = collectAnnotations();
    if (!annotations.length) {
      body.innerHTML = '<p class="ner-bm-empty">No annotations yet — tap Scan.</p>';
      return;
    }
    const groups = {};
    annotations.forEach(a => { (groups[a.type] = groups[a.type] || []).push(a.text); });
    const order = ['PERSON','ORG','LOCATION','DATE','MONEY'];
    const types = [...order.filter(t => groups[t]), ...Object.keys(groups).filter(t => !order.includes(t))];

    types.forEach(type => {
      const color = COLORS[type] || '#aaa';
      const group = document.createElement('div');
      group.className = 'ner-bm-group';
      group.innerHTML = `<div class="ner-bm-group-header">
        <span class="ner-bm-group-dot" style="background:${color}"></span>
        <span class="ner-bm-group-name" style="color:${color}">${type}</span>
        <span class="ner-bm-group-count">${groups[type].length}</span>
      </div>`;
      const chips = document.createElement('div');
      chips.className = 'ner-bm-chips';
      const counts = {};
      groups[type].forEach(t => { counts[t] = (counts[t] || 0) + 1; });
      Object.entries(counts).forEach(([text, count]) => {
        const chip = document.createElement('span');
        chip.className = 'ner-bm-chip';
        chip.style.cssText = `background:${color}22;border-color:${color}55;color:#ddd`;
        chip.innerHTML = `${escHtml(text)}${count > 1 ? `<span class="ner-rm">×${count}</span>` : ''}`;
        chip.addEventListener('click', () => scrollToEntity(text, type));
        chips.appendChild(chip);
      });
      group.appendChild(chips);
      body.appendChild(group);
    });
  }

  function renderRelations(body) {
    if (!allRelations.length) {
      body.innerHTML = '<p class="ner-bm-empty">No relations found yet — tap Scan first.</p>';
      return;
    }
    // group by label
    const groups = {};
    allRelations.forEach(r => { (groups[r.label] = groups[r.label] || []).push(r); });

    Object.entries(groups).forEach(([label, rels]) => {
      const color = rels[0].color;
      const group = document.createElement('div');
      group.className = 'ner-bm-group';
      group.innerHTML = `<div class="ner-bm-group-header">
        <span class="ner-bm-group-dot" style="background:${color}"></span>
        <span class="ner-bm-group-name" style="color:${color}">${label}</span>
        <span class="ner-bm-group-count">${rels.length}</span>
      </div>`;
      rels.forEach(rel => {
        const row = document.createElement('div');
        row.className = 'ner-bm-rel-row';
        const fc = COLORS[rel.fromType] || '#aaa';
        const tc = COLORS[rel.toType]   || '#aaa';
        row.innerHTML = `
          <span class="ner-bm-rel-from" style="background:${fc}22;color:${fc};border:1px solid ${fc}44">${escHtml(rel.from.textContent.trim())}</span>
          <span class="ner-bm-rel-arrow">→</span>
          <span class="ner-bm-rel-label" style="border:1px solid ${color}44;color:${color}">${label}</span>
          <span class="ner-bm-rel-arrow">→</span>
          <span class="ner-bm-rel-to"   style="background:${tc}22;color:${tc};border:1px solid ${tc}44">${escHtml(rel.to.textContent.trim())}</span>
        `;
        row.addEventListener('click', () => {
          highlightPair(rel.from, rel.to);
          rel.from.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        group.appendChild(row);
      });
      body.appendChild(group);
    });
  }

  function highlightPair(a, b) {
    document.querySelectorAll('mark.ner-bm-hi').forEach(m => m.classList.remove('ner-bm-hi'));
    a.classList.add('ner-bm-hi');
    b.classList.add('ner-bm-hi');
    setTimeout(() => { a.classList.remove('ner-bm-hi'); b.classList.remove('ner-bm-hi'); }, 2500);
  }

  function scrollToEntity(text, type) {
    const mark = Array.from(document.querySelectorAll('mark.ner-bm-label'))
      .find(m => m.textContent.trim() === text && m.dataset.entity === type);
    if (mark) mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── export ── */
  function buildExportData() {
    return {
      url: location.href,
      title: document.title,
      scannedAt: new Date().toISOString(),
      annotations: collectAnnotations(),
      relations: allRelations.map(r => ({
        from: r.from.textContent.trim(), fromType: r.fromType,
        relation: r.label,
        to:   r.to.textContent.trim(),   toType:   r.toType
      }))
    };
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(buildExportData(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ner-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  function copyJSON() {
    navigator.clipboard.writeText(JSON.stringify(buildExportData(), null, 2)).then(() => {
      const btn = document.getElementById('ner-bm-copy');
      if (!btn) return;
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });
  }

  function dedupHighlights() {
    const seen = new Set();
    document.querySelectorAll('mark.ner-bm-label').forEach(m => {
      const key = m.textContent.trim() + '|' + m.dataset.entity;
      if (seen.has(key)) unlabel(m); else seen.add(key);
    });
    allRelations = findRelations();
    drawRelationLines();
    refreshPanel();
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
    allRelations = findRelations();
    if (linesVisible) drawRelationLines();
    refreshPanel();
  }

  function showRemoveMenu(span, e) {
    hideRemoveMenu();
    const menu = document.createElement('div');
    menu.id = 'ner-bm-menu';
    menu.innerHTML = `<span>${span.dataset.entity}</span><button>Remove</button>`;
    menu.querySelector('button').addEventListener('click', () => {
      unlabel(span); hideRemoveMenu();
      allRelations = findRelations();
      if (linesVisible) drawRelationLines();
      refreshPanel();
    });
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
    if (!p) return;
    while (span.firstChild) p.insertBefore(span.firstChild, span);
    p.removeChild(span);
    p.normalize();
  }

  function clearHighlights() {
    document.querySelectorAll('mark.ner-bm-label').forEach(m => unlabel(m));
  }

  /* ── selection listeners ── */
  document.addEventListener('mouseup', e => {
    if (e.target.closest('#ner-bm-toolbar,#ner-bm-menu,#ner-bm-panel')) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
      currentRange = sel.getRangeAt(0).cloneRange();
    }, 10);
  });
  document.addEventListener('touchend', e => {
    if (e.target.closest('#ner-bm-toolbar,#ner-bm-menu,#ner-bm-panel')) return;
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
        if (p.closest('mark.ner-bm-label,#ner-bm-toolbar,#ner-bm-menu,#ner-bm-panel')) return NodeFilter.FILTER_REJECT;
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
      if (i < nodes.length) {
        requestAnimationFrame(batch);
      } else {
        allRelations = findRelations();
        if (linesVisible) drawRelationLines();
        refreshPanel();
      }
    }
    requestAnimationFrame(batch);
  }

  /* ── boot ── */
  buildToolbar();
  buildPanel();
  getSVG(); // create svg layer early
  runScan();

  window.__nerBMRescan = () => { clearHighlights(); allRelations = []; drawRelationLines(); runScan(); };
})();
