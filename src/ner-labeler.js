/**
 * NER Entity Labeling Plugin
 * A browser-based tool for annotating text with named entity labels.
 */
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_ENTITY_TYPES = [
  { name: 'Company',  color: '#4a90d9' },
  { name: 'People',   color: '#e07b54' },
  { name: 'Time',     color: '#c97fd4' },
  { name: 'Location', color: '#5ab86c' },
  { name: 'Item',     color: '#e0c454' },
];

let state = {
  /** Raw document text */
  text: '',
  /** Array of entity type objects: { id, name, color } */
  entityTypes: [],
  /** Array of annotation objects: { id, start, end, entityTypeId, text } */
  annotations: [],
  /** Currently selected entity type id for labeling */
  activeEntityTypeId: null,
  /** Currently selected annotation id */
  selectedAnnotationId: null,
  /** Undo stack of previous annotations arrays */
  undoStack: [],
  /** Mode: 'input' | 'labeling' */
  mode: 'input',
};

let nextId = 1;
const uid = () => String(nextId++);

// ─────────────────────────────────────────────────────────────────────────────
// DOM Refs
// ─────────────────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const DOM = {
  entityTypesList:    $('entity-types-list'),
  newEntityName:      $('new-entity-name'),
  newEntityColor:     $('new-entity-color'),
  btnAddEntity:       $('btn-add-entity'),
  rawTextInput:       $('raw-text-input'),
  charCount:          $('char-count'),
  btnAutoLabel:       $('btn-auto-label'),
  btnStartLabeling:   $('btn-start-labeling'),
  textInputMode:      $('text-input-mode'),
  labelingMode:       $('labeling-mode'),
  textDisplay:        $('text-display'),
  activeEntityBadge:  $('active-entity-badge'),
  btnEditText:        $('btn-edit-text'),
  btnClearText:       $('btn-clear-text'),
  btnClearLabels:     $('btn-clear-labels'),
  btnExport:          $('btn-export'),
  btnImport:          $('btn-import'),
  importFile:         $('import-file'),
  annotationsList:    $('annotations-list'),
  annotationCount:    $('annotation-count'),
  docStatus:          $('doc-status'),
  tooltip:            $('entity-tooltip'),
  confirmOverlay:     $('confirm-overlay'),
  confirmMessage:     $('confirm-message'),
  confirmOk:          $('confirm-ok'),
  confirmCancel:      $('confirm-cancel'),
};

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────

function init() {
  DEFAULT_ENTITY_TYPES.forEach(et => {
    state.entityTypes.push({ id: uid(), name: et.name, color: et.color });
  });

  loadFromStorage();
  bindEvents();
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Bindings
// ─────────────────────────────────────────────────────────────────────────────

function bindEvents() {
  // Add entity type
  DOM.btnAddEntity.addEventListener('click', handleAddEntityType);
  DOM.newEntityName.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddEntityType();
  });

  // Text input
  DOM.rawTextInput.addEventListener('input', () => {
    DOM.charCount.textContent = `${DOM.rawTextInput.value.length} characters`;
  });

  DOM.btnAutoLabel.addEventListener('click', handleAutoLabel);
  DOM.btnStartLabeling.addEventListener('click', handleStartLabeling);
  DOM.btnEditText.addEventListener('click', handleEditText);

  // Clear
  DOM.btnClearText.addEventListener('click', () => {
    confirm('Clear the document and all annotations?', () => {
      pushUndo();
      state.text = '';
      state.annotations = [];
      state.mode = 'input';
      DOM.rawTextInput.value = '';
      render();
    });
  });

  DOM.btnClearLabels.addEventListener('click', () => {
    confirm('Remove all annotations?', () => {
      pushUndo();
      state.annotations = [];
      render();
    });
  });

  // Export / Import
  DOM.btnExport.addEventListener('click', handleExport);
  DOM.btnImport.addEventListener('click', () => DOM.importFile.click());
  DOM.importFile.addEventListener('change', handleImport);

  // Text selection for labeling
  DOM.textDisplay.addEventListener('mouseup', handleTextSelection);
  DOM.textDisplay.addEventListener('touchend', handleTextSelection);

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeydown);

  // Tooltip hide on scroll
  DOM.textDisplay.addEventListener('scroll', hideTooltip);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

function handleAddEntityType() {
  const name = DOM.newEntityName.value.trim().toUpperCase();
  if (!name) return;
  if (state.entityTypes.find(et => et.name === name)) {
    flashInput(DOM.newEntityName, 'Entity type already exists');
    return;
  }
  state.entityTypes.push({ id: uid(), name, color: DOM.newEntityColor.value });
  DOM.newEntityName.value = '';
  DOM.newEntityColor.value = randomColor();
  saveToStorage();
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Detect NER Engine
// ─────────────────────────────────────────────────────────────────────────────

const _NER_DATE_RE   = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember))\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b|\b(?:Q[1-4]|H[12])\s+\d{4}\b/gi;
const _NER_MONEY_RE  = /\$\s*[\d,]+(?:\.\d{1,2})?(?:\s*(?:million|billion|trillion|[MBT]))?\b|\b[\d,]+(?:\.\d{1,2})?\s*(?:million|billion|trillion)?\s*(?:USD|EUR|GBP|JPY|CAD|AUD|RM|MYR|SGD|HKD|dollars?|euros?|pounds?|yuan|yen|ringgit)\b/gi;
const _NER_ORG_RE    = /\b(?:[A-Z][a-zA-Z&'\-]+(?:\s+[A-Z][a-zA-Z&'\-]+)*\s+(?:Inc\.?|Corp\.?|Ltd\.?|LLC|LLP|PLC|Co\.?|Company|Group|Holdings?|Foundation|Institute|University|College|School|Hospital|Bank|Fund|Trust|Association|Federation|Union|Alliance|Organization|Department|Agency|Bureau|Ministry|Commission|Council|Authority|Corporation|Industries|International|Global|National|Systems?|Solutions?|Technologies?|Services?|Networks?|Labs?|Media|Press|Times|Post|Capital|Berhad|Bhd\.?))\b/g;
const _NER_GEO_RE    = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|Avenue|Boulevard|Road|Drive|Lane|Park|Square|Bridge|River|Lake|Sea|Ocean|Mountain|Bay|Island|Valley|Desert|Beach|Harbor|Port|Airport|Station|District|County|Province|Region|Territory|City|Town|Village|Gulf)\b/g;
const _NER_ACRONYM_SKIP = new Set(['IS','IT','AN','IN','ON','AT','OR','TO','OF','AS','BY','SO','IF','UP','US','UK','EU','UN','WHO','HOW','WHY','THE','AND','FOR','BUT','NOT','ARE','WAS','HAS','NER','NLP','DATE','TIME','MISC','LOC','PER','ORG','GPE']);
const _NER_FIRST_NAMES = new Set(['James','John','Robert','Michael','William','David','Richard','Joseph','Thomas','Charles','Christopher','Daniel','Matthew','Anthony','Mark','Donald','Steven','Paul','Andrew','Joshua','Kenneth','Kevin','Brian','George','Timothy','Ronald','Edward','Jason','Jeffrey','Ryan','Jacob','Gary','Nicholas','Eric','Jonathan','Stephen','Larry','Justin','Scott','Brandon','Benjamin','Samuel','Raymond','Frank','Alexander','Patrick','Jack','Tyler','Aaron','Jose','Adam','Henry','Nathan','Peter','Kyle','Ethan','Jeremy','Keith','Noah','Carl','Sean','Austin','Arthur','Jesse','Dylan','Bryan','Victor','Ivan','Harry','Todd','Mary','Patricia','Jennifer','Linda','Barbara','Elizabeth','Susan','Jessica','Sarah','Karen','Lisa','Nancy','Betty','Margaret','Sandra','Ashley','Dorothy','Kimberly','Emily','Donna','Michelle','Carol','Amanda','Melissa','Deborah','Stephanie','Rebecca','Sharon','Laura','Cynthia','Amy','Angela','Anna','Brenda','Emma','Nicole','Helen','Samantha','Katherine','Christine','Rachel','Carolyn','Janet','Catherine','Maria','Heather','Diane','Julie','Victoria','Ruth','Lauren','Kelly','Christina','Joan','Evelyn','Andrea','Hannah','Megan','Martha','Madison','Teresa','Sara','Sophia','Julia','Grace','Charlotte','Natalie','Diana','Olivia','Ava','Mia','Chloe','Ella','Zoe','Lily','Liam','Oliver','Elijah','Aiden','Lucas','Mason','Asher','Leo','Mohammed','Muhammad','Ali','Omar','Ahmed','Hassan','Ibrahim','Fatima','Aisha','Pierre','Jean','Marie','Francois','Sophie','Nicolas','Hans','Klaus','Stefan','Carlos','Miguel','Diego','Sofia','Valentina','Sebastian','Mateo','Boris','Dmitri','Natasha','Alexei','Sergei','Raj','Priya','Amit','Rahul','Pooja','Arjun','Ahmad','Siti','Nurul','Mohd','Nor','Zulkifli','Tan','Lee','Wong','Lim','Chan','Ng','Yap','Khoo','Cheah','Goh']);
const _NER_COUNTRIES  = new Set(['Afghanistan','Albania','Algeria','Angola','Argentina','Armenia','Australia','Austria','Azerbaijan','Bangladesh','Belarus','Belgium','Bolivia','Brazil','Bulgaria','Cambodia','Cameroon','Canada','Chile','China','Colombia','Croatia','Cuba','Denmark','Ecuador','Egypt','Ethiopia','Finland','France','Georgia','Germany','Ghana','Greece','Guatemala','Hungary','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Japan','Jordan','Kazakhstan','Kenya','Kuwait','Lebanon','Libya','Malaysia','Mexico','Morocco','Myanmar','Nepal','Netherlands','Nigeria','Norway','Pakistan','Peru','Philippines','Poland','Portugal','Romania','Russia','Saudi Arabia','Serbia','Singapore','Somalia','Spain','Sudan','Sweden','Switzerland','Syria','Taiwan','Tanzania','Thailand','Tunisia','Turkey','Uganda','Ukraine','Vietnam','Yemen','Zimbabwe','United States','United Kingdom','United Arab Emirates','South Africa','South Korea','North Korea','New Zealand','Hong Kong','Sri Lanka']);

// Maps NER detector type → web-app entity type name (matched via .toUpperCase())
const _NER_TYPE_MAP = { PERSON:'PEOPLE', ORG:'COMPANY', LOCATION:'LOCATION', DATE:'TIME', MONEY:'ITEM' };

function autoDetectNER(text) {
  const res = [];
  function add(re, type) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null)
      res.push({ start: m.index, end: m.index + m[0].length, type });
  }
  add(_NER_DATE_RE,  'DATE');
  add(_NER_MONEY_RE, 'MONEY');
  add(_NER_ORG_RE,   'ORG');

  // Acronyms → ORG
  const aRe = /\b[A-Z]{2,5}\b/g;
  let m;
  while ((m = aRe.exec(text)) !== null)
    if (!_NER_ACRONYM_SKIP.has(m[0])) res.push({ start: m.index, end: m.index + m[0].length, type: 'ORG' });

  // Known first names → PERSON
  const pRe = /\b([A-Z][a-z]{1,15})(?:\s+[A-Z][a-z]{1,15}){1,3}\b/g;
  while ((m = pRe.exec(text)) !== null)
    if (_NER_FIRST_NAMES.has(m[0].split(' ')[0]))
      res.push({ start: m.index, end: m.index + m[0].length, type: 'PERSON' });

  // Countries → LOCATION
  _NER_COUNTRIES.forEach(c => {
    const re = new RegExp(`\\b${c.replace(/\s/g,'\\s+')}\\b`, 'g');
    while ((m = re.exec(text)) !== null)
      res.push({ start: m.index, end: m.index + m[0].length, type: 'LOCATION' });
  });

  // Geographic suffixes → LOCATION
  _NER_GEO_RE.lastIndex = 0;
  while ((m = _NER_GEO_RE.exec(text)) !== null)
    res.push({ start: m.index, end: m.index + m[0].length, type: 'LOCATION' });

  // Sort and de-overlap
  res.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = []; let last = -1;
  for (const r of res) { if (r.start >= last) { out.push(r); last = r.end; } }
  return out;
}

function handleAutoLabel() {
  const text = DOM.rawTextInput.value;
  if (!text.trim()) return;

  pushUndo();
  state.text = text;
  state.mode = 'labeling';
  state.annotations = [];

  const detections = autoDetectNER(text);
  let added = 0;

  detections.forEach(det => {
    const targetName = _NER_TYPE_MAP[det.type];
    if (!targetName) return;
    const et = state.entityTypes.find(e => e.name.toUpperCase() === targetName);
    if (!et) return;
    // Guard: skip if overlapping with an already-added annotation
    const overlaps = state.annotations.some(a => !(det.end <= a.start || det.start >= a.end));
    if (overlaps) return;
    state.annotations.push({ id: uid(), start: det.start, end: det.end, entityTypeId: et.id, text: text.slice(det.start, det.end) });
    added++;
  });

  render();
  saveToStorage();

  // Brief status update
  DOM.docStatus.textContent = `Auto-detected ${added} entit${added !== 1 ? 'ies' : 'y'}`;
}

function handleStartLabeling() {
  const text = DOM.rawTextInput.value;
  if (!text.trim()) return;
  pushUndo();
  state.text = text;
  state.mode = 'labeling';
  render();
  saveToStorage();
}

function handleEditText() {
  confirm('Editing text will clear all annotations. Continue?', () => {
    pushUndo();
    state.annotations = [];
    state.mode = 'input';
    DOM.rawTextInput.value = state.text;
    render();
  });
}

function handleTextSelection() {
  if (state.mode !== 'labeling') return;
  if (!state.activeEntityTypeId) {
    showTooltipMsg('Select an entity type first');
    return;
  }

  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;

  const range = sel.getRangeAt(0);
  const container = DOM.textDisplay;

  // Compute offsets relative to the text-display node
  const startOffset = getTextOffset(container, range.startContainer, range.startOffset);
  const endOffset   = getTextOffset(container, range.endContainer,   range.endOffset);

  if (startOffset === null || endOffset === null) { sel.removeAllRanges(); return; }

  const start = Math.min(startOffset, endOffset);
  const end   = Math.max(startOffset, endOffset);

  if (start === end) { sel.removeAllRanges(); return; }

  const selectedText = state.text.slice(start, end);
  if (!selectedText.trim()) { sel.removeAllRanges(); return; }

  // Check for overlapping annotations
  const overlaps = state.annotations.some(a => !(end <= a.start || start >= a.end));
  if (overlaps) {
    showTooltipMsg('Cannot overlap existing annotations');
    sel.removeAllRanges();
    return;
  }

  pushUndo();
  state.annotations.push({
    id: uid(),
    start,
    end,
    entityTypeId: state.activeEntityTypeId,
    text: selectedText,
  });

  sel.removeAllRanges();
  saveToStorage();
  render();
}

function handleKeydown(e) {
  // Undo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undo();
    return;
  }

  // Delete selected annotation
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedAnnotationId) {
    // Only delete if the focused element is NOT a text input
    if (document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA') return;
    e.preventDefault();
    deleteAnnotation(state.selectedAnnotationId);
    return;
  }

  // Escape — deselect
  if (e.key === 'Escape') {
    state.selectedAnnotationId = null;
    render();
  }
}

function handleExport() {
  const output = {
    text: state.text,
    entityTypes: state.entityTypes.map(et => ({ name: et.name, color: et.color })),
    annotations: state.annotations.map(a => {
      const et = state.entityTypes.find(e => e.id === a.entityTypeId);
      return {
        text: a.text,
        start: a.start,
        end: a.end,
        label: et ? et.name : 'UNKNOWN',
      };
    }),
  };
  downloadJSON(output, 'ner-annotations.json');
}

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const data = JSON.parse(evt.target.result);
      importData(data);
    } catch {
      alert('Invalid JSON file.');
    }
    DOM.importFile.value = '';
  };
  reader.readAsText(file);
}

function importData(data) {
  if (!data || typeof data.text !== 'string') {
    alert('Invalid NER annotation file.');
    return;
  }

  pushUndo();

  // Merge entity types
  const typeMap = {};
  state.entityTypes.forEach(et => { typeMap[et.name] = et; });

  (data.entityTypes || []).forEach(et => {
    if (!typeMap[et.name]) {
      const newEt = { id: uid(), name: et.name, color: et.color || randomColor() };
      state.entityTypes.push(newEt);
      typeMap[et.name] = newEt;
    }
  });

  state.text = data.text;
  state.annotations = (data.annotations || []).map(a => {
    const et = typeMap[a.label];
    return {
      id: uid(),
      start: a.start,
      end: a.end,
      entityTypeId: et ? et.id : null,
      text: a.text || data.text.slice(a.start, a.end),
    };
  }).filter(a => a.entityTypeId);

  state.mode = state.text ? 'labeling' : 'input';
  DOM.rawTextInput.value = state.text;
  saveToStorage();
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

function render() {
  renderEntityTypes();
  renderModeSwitch();
  if (state.mode === 'labeling') {
    renderTextDisplay();
    renderActiveEntityBadge();
  }
  renderAnnotationsList();
  updateDocStatus();
  saveToStorage();
}

function renderEntityTypes() {
  DOM.entityTypesList.innerHTML = '';
  state.entityTypes.forEach(et => {
    const item = document.createElement('div');
    item.className = 'entity-type-item' + (et.id === state.activeEntityTypeId ? ' active' : '');
    item.dataset.id = et.id;

    const swatch = document.createElement('span');
    swatch.className = 'entity-swatch';
    swatch.style.background = et.color;

    const name = document.createElement('span');
    name.className = 'entity-name';
    name.textContent = et.name;

    const count = state.annotations.filter(a => a.entityTypeId === et.id).length;
    const countBadge = document.createElement('span');
    countBadge.className = 'entity-count-badge';
    countBadge.textContent = count;

    const delBtn = document.createElement('button');
    delBtn.className = 'entity-delete-btn';
    delBtn.title = 'Remove entity type';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      deleteEntityType(et.id);
    });

    item.appendChild(swatch);
    item.appendChild(name);
    item.appendChild(countBadge);
    item.appendChild(delBtn);

    item.addEventListener('click', () => {
      state.activeEntityTypeId = (state.activeEntityTypeId === et.id) ? null : et.id;
      render();
    });

    DOM.entityTypesList.appendChild(item);
  });
}

function renderModeSwitch() {
  if (state.mode === 'input') {
    DOM.textInputMode.classList.remove('hidden');
    DOM.labelingMode.classList.add('hidden');
  } else {
    DOM.textInputMode.classList.add('hidden');
    DOM.labelingMode.classList.remove('hidden');
  }
}

function renderActiveEntityBadge() {
  const et = state.entityTypes.find(e => e.id === state.activeEntityTypeId);
  if (et) {
    DOM.activeEntityBadge.textContent = et.name;
    DOM.activeEntityBadge.style.background = hexToRgba(et.color, 0.2);
    DOM.activeEntityBadge.style.color = et.color;
    DOM.activeEntityBadge.style.borderColor = et.color;
  } else {
    DOM.activeEntityBadge.textContent = 'None selected';
    DOM.activeEntityBadge.style.background = '';
    DOM.activeEntityBadge.style.color = '';
    DOM.activeEntityBadge.style.borderColor = '';
  }
}

/**
 * Render the annotated text as HTML with colored entity spans.
 * Sorted annotations are rendered left-to-right; no overlaps allowed.
 */
function renderTextDisplay() {
  const text = state.text;
  const sorted = [...state.annotations].sort((a, b) => a.start - b.start);
  let html = '';
  let cursor = 0;

  sorted.forEach(ann => {
    const et = state.entityTypes.find(e => e.id === ann.entityTypeId);
    const color = et ? et.color : '#888';
    const bg = hexToRgba(color, 0.22);
    const isSelected = ann.id === state.selectedAnnotationId;

    // Text before this annotation
    if (ann.start > cursor) {
      html += escapeHtml(text.slice(cursor, ann.start));
    }

    const selectedClass = isSelected ? ' selected' : '';
    html += `<span class="ner-span${selectedClass}" data-ann-id="${ann.id}"
      style="background:${bg}; border-bottom:2px solid ${color}; color:${color};"
      title="${escapeAttr(et ? et.name : 'UNKNOWN')}"
    >`;
    html += escapeHtml(text.slice(ann.start, ann.end));
    html += `<span class="ner-label-tag" style="background:${color}; color:${contrastColor(color)};">${escapeHtml(et ? et.name : '?')}</span>`;
    html += '</span>';

    cursor = ann.end;
  });

  // Remaining text
  if (cursor < text.length) {
    html += escapeHtml(text.slice(cursor));
  }

  DOM.textDisplay.innerHTML = html;

  // Attach events to spans
  DOM.textDisplay.querySelectorAll('.ner-span').forEach(span => {
    const annId = span.dataset.annId;

    span.addEventListener('click', e => {
      e.stopPropagation();
      state.selectedAnnotationId = (state.selectedAnnotationId === annId) ? null : annId;
      render();
    });

    span.addEventListener('mouseenter', e => {
      const ann = state.annotations.find(a => a.id === annId);
      const et  = ann && state.entityTypes.find(t => t.id === ann.entityTypeId);
      if (!et) return;
      showTooltip(e, `${et.name}  [${ann.start}–${ann.end}]`);
    });

    span.addEventListener('mouseleave', hideTooltip);
  });

  // Clicking on the display background deselects
  DOM.textDisplay.addEventListener('click', e => {
    if (e.target === DOM.textDisplay) {
      state.selectedAnnotationId = null;
      renderTextDisplay();
    }
  }, { once: true });
}

function renderAnnotationsList() {
  const sorted = [...state.annotations].sort((a, b) => a.start - b.start);
  DOM.annotationCount.textContent = sorted.length;

  if (sorted.length === 0) {
    DOM.annotationsList.innerHTML = '<p class="empty-msg">No annotations yet.</p>';
    return;
  }

  DOM.annotationsList.innerHTML = '';
  sorted.forEach(ann => {
    const et    = state.entityTypes.find(e => e.id === ann.entityTypeId);
    const color = et ? et.color : '#888';
    const isSelected = ann.id === state.selectedAnnotationId;

    const item = document.createElement('div');
    item.className = 'annotation-item' + (isSelected ? ' selected' : '');
    item.dataset.annId = ann.id;

    const colorBar = document.createElement('div');
    colorBar.className = 'annotation-color-bar';
    colorBar.style.background = color;

    const info = document.createElement('div');
    info.className = 'annotation-info';

    const textEl = document.createElement('div');
    textEl.className = 'annotation-text';
    textEl.title = ann.text;
    textEl.textContent = ann.text;

    const meta = document.createElement('div');
    meta.className = 'annotation-meta';
    meta.textContent = `${et ? et.name : 'UNKNOWN'}  ·  ${ann.start}–${ann.end}`;

    info.appendChild(textEl);
    info.appendChild(meta);

    const delBtn = document.createElement('button');
    delBtn.className = 'annotation-delete-btn';
    delBtn.title = 'Delete annotation';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      deleteAnnotation(ann.id);
    });

    item.appendChild(colorBar);
    item.appendChild(info);
    item.appendChild(delBtn);

    item.addEventListener('click', () => {
      state.selectedAnnotationId = (state.selectedAnnotationId === ann.id) ? null : ann.id;
      render();
      // Scroll the selected span into view
      if (state.mode === 'labeling') {
        const span = DOM.textDisplay.querySelector(`[data-ann-id="${ann.id}"]`);
        if (span) span.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    DOM.annotationsList.appendChild(item);
  });
}

function updateDocStatus() {
  const wc = state.text ? state.text.trim().split(/\s+/).filter(Boolean).length : 0;
  DOM.docStatus.textContent = state.text
    ? `${state.text.length} chars · ${wc} words`
    : 'No document loaded';
}

// ─────────────────────────────────────────────────────────────────────────────
// Annotation Management
// ─────────────────────────────────────────────────────────────────────────────

function deleteAnnotation(id) {
  pushUndo();
  state.annotations = state.annotations.filter(a => a.id !== id);
  if (state.selectedAnnotationId === id) state.selectedAnnotationId = null;
  render();
}

function deleteEntityType(id) {
  const count = state.annotations.filter(a => a.entityTypeId === id).length;
  const msg = count > 0
    ? `Delete entity type and its ${count} annotation(s)?`
    : 'Delete this entity type?';

  confirm(msg, () => {
    pushUndo();
    state.entityTypes = state.entityTypes.filter(et => et.id !== id);
    state.annotations = state.annotations.filter(a => a.entityTypeId !== id);
    if (state.activeEntityTypeId === id) state.activeEntityTypeId = null;
    render();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Undo
// ─────────────────────────────────────────────────────────────────────────────

function pushUndo() {
  state.undoStack.push(JSON.stringify({
    text: state.text,
    annotations: state.annotations,
    entityTypes: state.entityTypes,
    activeEntityTypeId: state.activeEntityTypeId,
    mode: state.mode,
  }));
  if (state.undoStack.length > 50) state.undoStack.shift();
}

function undo() {
  if (!state.undoStack.length) return;
  const prev = JSON.parse(state.undoStack.pop());
  state.text = prev.text;
  state.annotations = prev.annotations;
  state.entityTypes = prev.entityTypes;
  state.activeEntityTypeId = prev.activeEntityTypeId;
  state.mode = prev.mode;
  state.selectedAnnotationId = null;
  DOM.rawTextInput.value = state.text;
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

function saveToStorage() {
  try {
    localStorage.setItem('ner-plugin-state', JSON.stringify({
      schemaVersion: ENTITY_SCHEMA_VERSION,
      text: state.text,
      entityTypes: state.entityTypes,
      annotations: state.annotations,
      activeEntityTypeId: state.activeEntityTypeId,
      mode: state.mode,
      nextId,
    }));
  } catch { /* storage quota exceeded, ignore */ }
}

// Increment whenever DEFAULT_ENTITY_TYPES changes; forces entity type reset.
const ENTITY_SCHEMA_VERSION = 2;

function loadFromStorage() {
  try {
    const raw = localStorage.getItem('ner-plugin-state');
    if (!raw) return;
    const saved = JSON.parse(raw);
    // Only restore saved entity types when the schema version matches,
    // otherwise keep the new defaults so renamed types take effect.
    if ((saved.schemaVersion || 1) >= ENTITY_SCHEMA_VERSION) {
      state.entityTypes = saved.entityTypes || state.entityTypes;
    }
    state.text              = saved.text              || '';
    state.annotations       = saved.annotations       || [];
    state.activeEntityTypeId= saved.activeEntityTypeId|| null;
    state.mode              = saved.mode              || 'input';
    nextId                  = saved.nextId            || nextId;
    DOM.rawTextInput.value  = state.text;
    DOM.charCount.textContent = `${state.text.length} characters`;
  } catch { /* corrupted storage, ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip helpers
// ─────────────────────────────────────────────────────────────────────────────

function showTooltip(e, msg) {
  DOM.tooltip.textContent = msg;
  DOM.tooltip.classList.remove('hidden');
  positionTooltip(e);
}

function showTooltipMsg(msg) {
  DOM.tooltip.textContent = msg;
  DOM.tooltip.classList.remove('hidden');
  const rect = DOM.textDisplay.getBoundingClientRect();
  DOM.tooltip.style.left = (rect.left + 10) + 'px';
  DOM.tooltip.style.top  = (rect.top  + 10) + 'px';
  setTimeout(hideTooltip, 2000);
}

function positionTooltip(e) {
  const tt = DOM.tooltip;
  tt.style.left = (e.clientX + 12) + 'px';
  tt.style.top  = (e.clientY - 36) + 'px';
}

function hideTooltip() {
  DOM.tooltip.classList.add('hidden');
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirm dialog
// ─────────────────────────────────────────────────────────────────────────────

let _confirmCallback = null;

function confirm(message, onConfirm) {
  DOM.confirmMessage.textContent = message;
  DOM.confirmOverlay.classList.remove('hidden');
  _confirmCallback = onConfirm;
}

DOM.confirmOk.addEventListener('click', () => {
  DOM.confirmOverlay.classList.add('hidden');
  if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
});

DOM.confirmCancel.addEventListener('click', () => {
  DOM.confirmOverlay.classList.add('hidden');
  _confirmCallback = null;
});

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the character offset of (node, nodeOffset) relative to a container
 * element, counting only text nodes.
 */
function getTextOffset(container, node, nodeOffset) {
  let offset = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);

  while (walker.nextNode()) {
    const current = walker.currentNode;
    if (current === node) {
      return offset + nodeOffset;
    }
    // Check if the node is inside a .ner-label-tag (the label badge) — skip those
    if (isInsideLabelTag(current)) continue;
    offset += current.textContent.length;
  }

  // Fallback: node not found in walk (e.g. clicked inside tag badge)
  return null;
}

function isInsideLabelTag(node) {
  let n = node;
  while (n) {
    if (n.classList && n.classList.contains('ner-label-tag')) return true;
    n = n.parentElement;
  }
  return false;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;');
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Returns black or white depending on background luminance. */
function contrastColor(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 0.55 ? '#111' : '#fff';
}

function randomColor() {
  const palette = [
    '#e07b54','#4a90d9','#5ab86c','#c97fd4','#e0c454',
    '#d44e4e','#47bfbf','#7b7fe0','#e07bb0','#7bc97b',
  ];
  return palette[Math.floor(Math.random() * palette.length)];
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function flashInput(el, msg) {
  el.style.borderColor = 'var(--danger)';
  el.title = msg;
  setTimeout(() => {
    el.style.borderColor = '';
    el.title = '';
  }, 1800);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
