/**
 * NER Entity Labeling Plugin
 * A browser-based tool for annotating text with named entity labels
 * and relationship types between entities.
 */
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_ENTITY_TYPES = [
  { name: 'Company',  color: '#4a90d9' },
  { name: 'People',   color: '#e07b54' },
  { name: 'Time',     color: '#c97fd4' },
  { name: 'Location', color: '#5ab86c' },
  { name: 'Item',     color: '#e0c454' },
];

const DEFAULT_REL_TYPES = [
  { name: 'Operates',            color: '#f39c12' },
  { name: 'Owes / In Debt',      color: '#e74c3c' },
  { name: 'Sells / Divests',     color: '#9b59b6' },
  { name: 'Acquires',            color: '#2ecc71' },
  { name: 'Partners With',       color: '#3498db' },
  { name: 'Subsidiary Of',       color: '#1abc9c' },
  { name: 'Contracts / Awarded', color: '#e67e22' },
  { name: 'Listed On',           color: '#27ae60' },
  { name: 'Owned By',            color: '#8e44ad' },
  { name: 'Appointed',           color: '#d35400' },
  { name: 'Raises Capital',      color: '#c0392b' },
  { name: 'Located In',          color: '#16a085' },
];

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let state = {
  text: '',
  entityTypes: [],
  annotations: [],
  relationshipTypes: [],
  relAnnotations: [],
  activeEntityTypeId: null,
  activeRelTypeId: null,
  selectedAnnotationId: null,
  selectedRelAnnId: null,
  undoStack: [],
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
  relTypesList:       $('rel-types-list'),
  newRelName:         $('new-rel-name'),
  newRelColor:        $('new-rel-color'),
  btnAddRel:          $('btn-add-rel'),
  rawTextInput:       $('raw-text-input'),
  charCount:          $('char-count'),
  btnAutoLabel:       $('btn-auto-label'),
  btnStartLabeling:   $('btn-start-labeling'),
  textInputMode:      $('text-input-mode'),
  labelingMode:       $('labeling-mode'),
  textDisplay:        $('text-display'),
  activeEntityLabel:  $('active-entity-label'),
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
  DEFAULT_REL_TYPES.forEach(rt => {
    state.relationshipTypes.push({ id: uid(), name: rt.name, color: rt.color });
  });

  loadFromStorage();
  bindEvents();
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Bindings
// ─────────────────────────────────────────────────────────────────────────────

function bindEvents() {
  DOM.btnAddEntity.addEventListener('click', handleAddEntityType);
  DOM.newEntityName.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddEntityType();
  });

  DOM.btnAddRel.addEventListener('click', handleAddRelType);
  DOM.newRelName.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddRelType();
  });

  DOM.rawTextInput.addEventListener('input', () => {
    DOM.charCount.textContent = `${DOM.rawTextInput.value.length} characters`;
  });

  DOM.rawTextInput.addEventListener('paste', () => {
    setTimeout(handleAutoLabel, 0);
  });

  (DOM.btnAutoLabel || document.getElementById('btn-auto-label'))
    ?.addEventListener('click', handleAutoLabel);
  DOM.btnStartLabeling.addEventListener('click', handleStartLabeling);
  DOM.btnEditText.addEventListener('click', handleEditText);

  DOM.btnClearText.addEventListener('click', () => {
    confirm('Clear the document and all annotations?', () => {
      pushUndo();
      state.text = '';
      state.annotations = [];
      state.relAnnotations = [];
      state.mode = 'input';
      DOM.rawTextInput.value = '';
      render();
    });
  });

  DOM.btnClearLabels.addEventListener('click', () => {
    confirm('Remove all annotations?', () => {
      pushUndo();
      state.annotations = [];
      state.relAnnotations = [];
      render();
    });
  });

  DOM.btnExport.addEventListener('click', handleExport);
  DOM.btnImport.addEventListener('click', () => DOM.importFile.click());
  DOM.importFile.addEventListener('change', handleImport);

  DOM.textDisplay.addEventListener('mouseup', handleTextSelection);
  DOM.textDisplay.addEventListener('touchend', handleTextSelection);

  document.addEventListener('keydown', handleKeydown);
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

function handleAddRelType() {
  const name = DOM.newRelName.value.trim().toUpperCase();
  if (!name) return;
  if (state.relationshipTypes.find(rt => rt.name === name)) {
    flashInput(DOM.newRelName, 'Relationship type already exists');
    return;
  }
  state.relationshipTypes.push({ id: uid(), name, color: DOM.newRelColor.value });
  DOM.newRelName.value = '';
  DOM.newRelColor.value = randomColor();
  saveToStorage();
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// NER Engine — Entity Detection
// ─────────────────────────────────────────────────────────────────────────────

const _NER_DATE_RE = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember))\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b|\b(?:Q[1-4]|H[12])\s+\d{4}\b/gi;

const _NER_MONEY_RE = /\bRM\s*[\d,.]+(?:\s*(?:million|billion|trillion|mil|bil|[MBmbt]))?\b|\$\s*[\d,]+(?:\.\d{1,2})?(?:\s*(?:million|billion|trillion|[MBT]))?\b|\b[\d,]+(?:\.\d{1,2})?\s*(?:million|billion|trillion)?\s*(?:USD|EUR|GBP|JPY|CAD|AUD|MYR|SGD|HKD|dollars?|euros?|pounds?|yuan|yen|ringgit|sen)\b/gi;

const _NER_ORG_RE = /\b(?:[A-Z][a-zA-Z&''\-]+(?:\s+(?:&\s+)?[A-Z][a-zA-Z&''\-]+)*\s+(?:Inc\.?|Corp\.?|Ltd\.?|LLC|LLP|PLC|Co\.?|Company|Group|Holdings?|Foundation|Institute|University|College|School|Hospital|Bank|Fund|Trust|Association|Federation|Union|Alliance|Organization|Department|Agency|Bureau|Ministry|Commission|Council|Authority|Corporation|Industries|International|Global|National|Systems?|Solutions?|Technologies?|Services?|Networks?|Labs?|Media|Press|Times|Post|Capital|Berhad|Bhd\.?|Sdn\s+Bhd\.?|Ventures?|Partners?|Consultants?|Resources?))\b/g;

const _NER_GEO_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|Avenue|Boulevard|Road|Drive|Lane|Park|Square|Bridge|River|Lake|Sea|Ocean|Mountain|Bay|Island|Valley|Desert|Beach|Harbor|Harbour|Port|Airport|Station|District|County|Province|Region|Territory|City|Town|Village|Gulf|Highway|Expressway|Interchange)\b/g;

const _NER_PHYSICAL_ITEM_RE = /\b(?:factor(?:y|ies)|plant[s]?|outlet[s]?|branch(?:es)?|facilit(?:y|ies)|estate[s]?|mill[s]?|mine[s]?|quarr(?:y|ies)|refiner(?:y|ies)|warehouse[s]?|terminal[s]?|depot[s]?|plantation[s]?|resort[s]?|hotel[s]?|port[s]?|jett(?:y|ies))\b/gi;

const _NER_ACRONYM_SKIP = new Set([
  'IS','IT','AN','IN','ON','AT','OR','TO','OF','AS','BY','SO','IF','UP','DO','NO','GO','BE','HE','WE','ME',
  'US','UK','EU','UN','WHO','HOW','WHY','THE','AND','FOR','BUT','NOT','ARE','WAS','HAS','HAD','CAN','MAY',
  'NER','NLP','DATE','TIME','MISC','LOC','PER','ORG','GPE','ALL','ITS','SET','END','NEW','OLD','ONE','TWO',
  // Malaysian location abbreviations
  'KL','PJ','JB','KK','SJ','PG','MY',
  // Malay common words that appear in ALL CAPS
  'KUALA','PULAU','BUKIT','TAMAN','JALAN','LORONG','BATU','SERI','DAN','DARI','YANG','ATAS','BAGI',
  // Financial instruments (not companies)
  'RCULS','ICULS','ESOS','LTIP','RCPS',
  // Currencies
  'MYR','RM','SGD','USD','EUR','GBP','JPY','AUD','CAD','HKD','CNY','THB','IDR','PHP',
  // Common biz / finance abbreviations
  'CEO','COO','CFO','CTO','CIO','MD','GM','VP','HR','IR','PR',
  'FY','YTD','YOY','QOQ','EPS','NAV','ROE','ROA','ROI',
  'GDP','GNP','CPI','PPI','PMI',
  'RFP','RFQ','MOU','LOI','LOA','SPA','MSA','NDA',
  'PDF','CSV','API','URL',
  'ICT','IOT',
]);

const _NER_FIRST_NAMES = new Set(['James','John','Robert','Michael','William','David','Richard','Joseph','Thomas','Charles','Christopher','Daniel','Matthew','Anthony','Mark','Donald','Steven','Paul','Andrew','Joshua','Kenneth','Kevin','Brian','George','Timothy','Ronald','Edward','Jason','Jeffrey','Ryan','Jacob','Gary','Nicholas','Eric','Jonathan','Stephen','Larry','Justin','Scott','Brandon','Benjamin','Samuel','Raymond','Frank','Alexander','Patrick','Jack','Tyler','Aaron','Jose','Adam','Henry','Nathan','Peter','Kyle','Ethan','Jeremy','Keith','Noah','Carl','Sean','Austin','Arthur','Jesse','Dylan','Bryan','Victor','Ivan','Harry','Todd','Mary','Patricia','Jennifer','Linda','Barbara','Elizabeth','Susan','Jessica','Sarah','Karen','Lisa','Nancy','Betty','Margaret','Sandra','Ashley','Dorothy','Kimberly','Emily','Donna','Michelle','Carol','Amanda','Melissa','Deborah','Stephanie','Rebecca','Sharon','Laura','Cynthia','Amy','Angela','Anna','Brenda','Emma','Nicole','Helen','Samantha','Katherine','Christine','Rachel','Carolyn','Janet','Catherine','Maria','Heather','Diane','Julie','Victoria','Ruth','Lauren','Kelly','Christina','Joan','Evelyn','Andrea','Hannah','Megan','Martha','Madison','Teresa','Sara','Sophia','Julia','Grace','Charlotte','Natalie','Diana','Olivia','Ava','Mia','Chloe','Ella','Zoe','Lily','Liam','Oliver','Elijah','Aiden','Lucas','Mason','Asher','Leo','Mohammed','Muhammad','Ali','Omar','Ahmed','Hassan','Ibrahim','Fatima','Aisha','Pierre','Jean','Marie','Francois','Sophie','Nicolas','Hans','Klaus','Stefan','Carlos','Miguel','Diego','Sofia','Valentina','Sebastian','Mateo','Boris','Dmitri','Natasha','Alexei','Sergei','Raj','Priya','Amit','Rahul','Pooja','Arjun','Ahmad','Siti','Nurul','Mohd','Nor','Zulkifli','Tan','Lee','Wong','Lim','Chan','Ng','Yap','Khoo','Cheah','Goh']);

const _NER_COUNTRIES = new Set(['Afghanistan','Albania','Algeria','Angola','Argentina','Armenia','Australia','Austria','Azerbaijan','Bangladesh','Belarus','Belgium','Bolivia','Brazil','Bulgaria','Cambodia','Cameroon','Canada','Chile','China','Colombia','Croatia','Cuba','Denmark','Ecuador','Egypt','Ethiopia','Finland','France','Georgia','Germany','Ghana','Greece','Guatemala','Hungary','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Japan','Jordan','Kazakhstan','Kenya','Kuwait','Lebanon','Libya','Malaysia','Mexico','Morocco','Myanmar','Nepal','Netherlands','Nigeria','Norway','Pakistan','Peru','Philippines','Poland','Portugal','Romania','Russia','Saudi Arabia','Serbia','Singapore','Somalia','Spain','Sudan','Sweden','Switzerland','Syria','Taiwan','Tanzania','Thailand','Tunisia','Turkey','Uganda','Ukraine','Vietnam','Yemen','Zimbabwe','United States','United Kingdom','United Arab Emirates','South Africa','South Korea','North Korea','New Zealand','Hong Kong','Sri Lanka']);

// ─── Malaysian-specific locations ──────────────────────────────────────────
const _MY_LOCATIONS = new Set([
  // Federal territories
  'Kuala Lumpur','Labuan','Putrajaya',
  // States
  'Johor','Kedah','Kelantan','Melaka','Malacca',
  'Negeri Sembilan','Pahang','Perak','Perlis',
  'Penang','Pulau Pinang','Sabah','Sarawak','Selangor','Terengganu',
  // Major cities / towns
  'Petaling Jaya','Shah Alam','Subang Jaya','Klang',
  'Ampang','Cheras','Rawang','Kajang','Puchong',
  'Sepang','Cyberjaya','Damansara','Bangsar','Kepong',
  'Ipoh','Johor Bahru','Georgetown','George Town','Kota Kinabalu',
  'Kuching','Alor Setar','Kota Bharu','Kota Bahru',
  'Kuantan','Seremban','Miri','Sibu','Bintulu',
  'Sandakan','Tawau','Taiping','Teluk Intan',
  'Sungai Petani','Kulim','Bukit Mertajam',
  'Butterworth','Batu Pahat','Muar','Segamat',
  'Kluang','Skudai','Iskandar Puteri','Nusajaya',
  'Kemaman','Kuala Terengganu','Dungun',
  'Port Klang','Port Dickson','Tanjung Pelepas',
  'Pasir Gudang','Senai','Nilai','Semenyih',
  'Serdang','Bangi','Putrajaya','Sri Petaling',
  'Bukit Jalil','Chow Kit','Sentul','Titiwangsa',
  // Regions
  'Peninsular Malaysia','East Malaysia','Peninsular',
  'Klang Valley','Borneo','Iskandar Malaysia',
  'Northern Corridor','Eastern Corridor',
  // KL areas / landmarks
  'KLCC','Bukit Bintang','Mont Kiara','Sri Hartamas',
  'Bangsar South','Setapak','Wangsa Maju',
  'Brickfields','KL Sentral','Desa ParkCity',
]);

// Maps NER detector type → entity type name (matched via .toUpperCase())
const _NER_TYPE_MAP = {
  PERSON: 'PEOPLE',
  ORG: 'COMPANY',
  LOCATION: 'LOCATION',
  DATE: 'TIME',
  MONEY: 'ITEM',
  PHYSICAL_ITEM: 'ITEM',
};

function autoDetectNER(text) {
  const res = [];
  let m;

  function add(re, type) {
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null)
      res.push({ start: m.index, end: m.index + m[0].length, type });
  }

  add(_NER_DATE_RE, 'DATE');
  add(_NER_MONEY_RE, 'MONEY');
  add(_NER_ORG_RE, 'ORG');
  add(_NER_PHYSICAL_ITEM_RE, 'PHYSICAL_ITEM');

  // Acronyms → ORG (with expanded skip list)
  const aRe = /\b[A-Z]{2,5}\b/g;
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

  // Malaysian locations → LOCATION
  _MY_LOCATIONS.forEach(loc => {
    const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const re = new RegExp(`\\b${escaped}\\b`, 'g');
    while ((m = re.exec(text)) !== null)
      res.push({ start: m.index, end: m.index + m[0].length, type: 'LOCATION' });
  });

  // De-overlap: sort by start, keep longest
  res.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const out = []; let last = -1;
  for (const r of res) { if (r.start >= last) { out.push(r); last = r.end; } }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// NER Engine — Relationship Detection
// ─────────────────────────────────────────────────────────────────────────────

const _REL_PATTERNS = [
  {
    name: 'Operates',
    patterns: [
      /\boperate[sd]?\b/gi, /\boperating\b/gi,
      /\bmanage[sd]?\b/gi, /\bmanaging\b/gi,
    ]
  },
  {
    name: 'Owes / In Debt',
    patterns: [
      /\bowed\b/gi, /\bowes\b/gi, /\bowing\b/gi,
      /\bin\s+debt\b/gi, /\bliabilit\w+\b/gi,
      /\bborrow(?:ed|s|ing)\b/gi,
      /\bdefault(?:ed|s|ing)?\s+on\b/gi,
      /\bpayable\b/gi, /\breceivable\b/gi,
    ]
  },
  {
    name: 'Sells / Divests',
    patterns: [
      /\bsell(?:s|ing)?\b/gi, /\bsold\b/gi,
      /\bdispose[sd]?\b/gi, /\bdisposing\b/gi, /\bdisposal\b/gi,
      /\bdivest(?:s|ed|ing|iture)?\b/gi,
    ]
  },
  {
    name: 'Acquires',
    patterns: [
      /\bacquire[sd]?\b/gi, /\bacquiring\b/gi, /\bacquisition\b/gi,
      /\btakeover\b/gi, /\btook\s+over\b/gi,
      /\bmerge[sd]?\b/gi, /\bmerging\b/gi, /\bmerger\b/gi,
      /\bpurchase[sd]?\b/gi, /\bbuy(?:s|ing)?\b/gi, /\bbought\b/gi,
    ]
  },
  {
    name: 'Partners With',
    patterns: [
      /\bjoint\s+venture\b/gi,
      /\bpartner(?:s|ed|ing|ship)?\b/gi,
      /\bcollaborat\w+\b/gi, /\balliance\b/gi,
      /\bconsortium\b/gi,
    ]
  },
  {
    name: 'Subsidiary Of',
    patterns: [
      /\bsubsidiar\w+\b/gi, /\baffiliat\w+\b/gi,
      /\bwholly[\-\s]owned\b/gi,
      /\bparent\s+compan\w+\b/gi,
    ]
  },
  {
    name: 'Contracts / Awarded',
    patterns: [
      /\bawarded?\b/gi, /\bawarding\b/gi,
      /\bcontract(?:s|ed|ing)?\b/gi,
      /\btendered?\b/gi, /\btendering\b/gi,
      /\bprocure[sd]?\b/gi, /\bprocurement\b/gi,
      /\bcommission(?:ed|ing)?\b/gi,
    ]
  },
  {
    name: 'Listed On',
    patterns: [
      /\blisted\s+on\b/gi, /\blisting\b/gi,
      /\btraded\s+on\b/gi, /\bdelisted?\b/gi,
      /\bfloat(?:ed|ing)?\b/gi, /\bBursa\b/gi,
    ]
  },
  {
    name: 'Owned By',
    patterns: [
      /\bowned?\s+by\b/gi, /\bbelong(?:s|ed)?\s+to\b/gi,
      /\bcontrolled?\s+by\b/gi, /\bheld\s+by\b/gi,
      /\bshareholder[s]?\b/gi, /\bstakeholder[s]?\b/gi,
      /\bmajority\s+(?:stake|shareholder|owner)\b/gi,
    ]
  },
  {
    name: 'Appointed',
    patterns: [
      /\bappoint(?:s|ed|ing|ment)?\b/gi,
      /\bnominat(?:e[sd]?|ing|ion)?\b/gi,
      /\bresign(?:s|ed|ing|ation)?\b/gi,
      /\bstepped?\s+down\b/gi, /\bretire[sd]?\b/gi,
    ]
  },
  {
    name: 'Raises Capital',
    patterns: [
      /\brights?\s+issue\b/gi, /\bplacement\b/gi,
      /\braise[sd]?\s+(?:fund[s]?|capital)\b/gi,
      /\bbond\s+issuance\b/gi, /\bsukuk\b/gi,
      /\bwarrant[s]?\b/gi,
      /\bprivate\s+placement\b/gi,
    ]
  },
  {
    name: 'Located In',
    patterns: [
      /\bbase[sd]\s+in\b/gi, /\bheadquartered?\s+in\b/gi,
      /\bsituated?\s+in\b/gi, /\blocated?\s+in\b/gi,
    ]
  },
];

function autoDetectRelationships(text) {
  const res = [];
  _REL_PATTERNS.forEach(({ name, patterns }) => {
    patterns.forEach(pat => {
      pat.lastIndex = 0;
      let m;
      while ((m = pat.exec(text)) !== null) {
        res.push({ start: m.index, end: m.index + m[0].length, name });
      }
    });
  });
  // De-overlap
  res.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const out = []; let last = -1;
  for (const r of res) { if (r.start >= last) { out.push(r); last = r.end; } }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Label Handler
// ─────────────────────────────────────────────────────────────────────────────

function handleAutoLabel() {
  const text = DOM.rawTextInput.value;
  if (!text.trim()) return;

  pushUndo();
  state.text = text;
  state.mode = 'labeling';
  state.annotations = [];
  state.relAnnotations = [];

  // Entity detection
  const detections = autoDetectNER(text);
  let entAdded = 0;

  detections.forEach(det => {
    const targetName = _NER_TYPE_MAP[det.type];
    if (!targetName) return;
    const et = state.entityTypes.find(e => e.name.toUpperCase() === targetName);
    if (!et) return;
    const overlaps = state.annotations.some(a => !(det.end <= a.start || det.start >= a.end));
    if (overlaps) return;
    state.annotations.push({ id: uid(), start: det.start, end: det.end, entityTypeId: et.id, text: text.slice(det.start, det.end) });
    entAdded++;
  });

  // Relationship detection
  const relDetections = autoDetectRelationships(text);
  let relAdded = 0;

  relDetections.forEach(det => {
    const rt = state.relationshipTypes.find(r => r.name === det.name);
    if (!rt) return;
    // Don't overlap with entity annotations or other rel annotations
    const overlapsEnt = state.annotations.some(a => !(det.end <= a.start || det.start >= a.end));
    const overlapsRel = state.relAnnotations.some(a => !(det.end <= a.start || det.start >= a.end));
    if (overlapsEnt || overlapsRel) return;
    state.relAnnotations.push({ id: uid(), start: det.start, end: det.end, relTypeId: rt.id, text: text.slice(det.start, det.end) });
    relAdded++;
  });

  render();
  saveToStorage();
  DOM.docStatus.textContent = `Auto-detected ${entAdded} entit${entAdded !== 1 ? 'ies' : 'y'}, ${relAdded} relationship${relAdded !== 1 ? 's' : ''}`;
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
    state.relAnnotations = [];
    state.mode = 'input';
    DOM.rawTextInput.value = state.text;
    render();
  });
}

function handleTextSelection() {
  if (state.mode !== 'labeling') return;

  const entityMode = !!state.activeEntityTypeId;
  const relMode = !entityMode && !!state.activeRelTypeId;

  if (!entityMode && !relMode) {
    showTooltipMsg('Select an entity type or relationship type first');
    return;
  }

  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;

  const range = sel.getRangeAt(0);
  const container = DOM.textDisplay;

  const startOffset = getTextOffset(container, range.startContainer, range.startOffset);
  const endOffset   = getTextOffset(container, range.endContainer,   range.endOffset);

  if (startOffset === null || endOffset === null) { sel.removeAllRanges(); return; }

  const start = Math.min(startOffset, endOffset);
  const end   = Math.max(startOffset, endOffset);

  if (start === end) { sel.removeAllRanges(); return; }

  const selectedText = state.text.slice(start, end);
  if (!selectedText.trim()) { sel.removeAllRanges(); return; }

  // Check overlaps with all annotations
  const allAnns = [
    ...state.annotations.map(a => ({ start: a.start, end: a.end })),
    ...state.relAnnotations.map(a => ({ start: a.start, end: a.end })),
  ];
  const overlaps = allAnns.some(a => !(end <= a.start || start >= a.end));
  if (overlaps) {
    showTooltipMsg('Cannot overlap existing annotations');
    sel.removeAllRanges();
    return;
  }

  pushUndo();

  if (entityMode) {
    state.annotations.push({
      id: uid(), start, end,
      entityTypeId: state.activeEntityTypeId,
      text: selectedText,
    });
  } else {
    state.relAnnotations.push({
      id: uid(), start, end,
      relTypeId: state.activeRelTypeId,
      text: selectedText,
    });
  }

  sel.removeAllRanges();
  saveToStorage();
  render();
}

function handleKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undo();
    return;
  }

  if ((e.key === 'Delete' || e.key === 'Backspace') &&
      (state.selectedAnnotationId || state.selectedRelAnnId)) {
    if (document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA') return;
    e.preventDefault();
    if (state.selectedAnnotationId) deleteAnnotation(state.selectedAnnotationId);
    else if (state.selectedRelAnnId) deleteRelAnnotation(state.selectedRelAnnId);
    return;
  }

  if (e.key === 'Escape') {
    state.selectedAnnotationId = null;
    state.selectedRelAnnId = null;
    render();
  }
}

function handleExport() {
  const output = {
    text: state.text,
    entityTypes: state.entityTypes.map(et => ({ name: et.name, color: et.color })),
    annotations: state.annotations.map(a => {
      const et = state.entityTypes.find(e => e.id === a.entityTypeId);
      return { text: a.text, start: a.start, end: a.end, label: et ? et.name : 'UNKNOWN' };
    }),
    relationshipTypes: state.relationshipTypes.map(rt => ({ name: rt.name, color: rt.color })),
    relationships: state.relAnnotations.map(ra => {
      const rt = state.relationshipTypes.find(r => r.id === ra.relTypeId);
      return { text: ra.text, start: ra.start, end: ra.end, label: rt ? rt.name : 'UNKNOWN' };
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

  // Merge relationship types
  const relMap = {};
  state.relationshipTypes.forEach(rt => { relMap[rt.name] = rt; });

  (data.relationshipTypes || []).forEach(rt => {
    if (!relMap[rt.name]) {
      const newRt = { id: uid(), name: rt.name, color: rt.color || randomColor() };
      state.relationshipTypes.push(newRt);
      relMap[rt.name] = newRt;
    }
  });

  state.text = data.text;
  state.annotations = (data.annotations || []).map(a => {
    const et = typeMap[a.label];
    return {
      id: uid(),
      start: a.start, end: a.end,
      entityTypeId: et ? et.id : null,
      text: a.text || data.text.slice(a.start, a.end),
    };
  }).filter(a => a.entityTypeId);

  state.relAnnotations = (data.relationships || []).map(r => {
    const rt = relMap[r.label];
    return {
      id: uid(),
      start: r.start, end: r.end,
      relTypeId: rt ? rt.id : null,
      text: r.text || data.text.slice(r.start, r.end),
    };
  }).filter(r => r.relTypeId);

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
  renderRelTypes();
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
    delBtn.textContent = '\u00d7';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      deleteEntityType(et.id);
    });

    item.appendChild(swatch);
    item.appendChild(name);
    item.appendChild(countBadge);
    item.appendChild(delBtn);

    item.addEventListener('click', () => {
      if (state.activeEntityTypeId === et.id) {
        state.activeEntityTypeId = null;
      } else {
        state.activeEntityTypeId = et.id;
        state.activeRelTypeId = null; // mutual exclusion
      }
      render();
    });

    DOM.entityTypesList.appendChild(item);
  });
}

function renderRelTypes() {
  DOM.relTypesList.innerHTML = '';
  state.relationshipTypes.forEach(rt => {
    const item = document.createElement('div');
    item.className = 'entity-type-item' + (rt.id === state.activeRelTypeId ? ' active' : '');
    item.dataset.id = rt.id;

    const swatch = document.createElement('span');
    swatch.className = 'rel-swatch';
    swatch.style.color = rt.color;
    swatch.textContent = '\u2194';

    const name = document.createElement('span');
    name.className = 'entity-name';
    name.textContent = rt.name;

    const count = state.relAnnotations.filter(a => a.relTypeId === rt.id).length;
    const countBadge = document.createElement('span');
    countBadge.className = 'entity-count-badge';
    countBadge.textContent = count;

    const delBtn = document.createElement('button');
    delBtn.className = 'entity-delete-btn';
    delBtn.title = 'Remove relationship type';
    delBtn.textContent = '\u00d7';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      deleteRelType(rt.id);
    });

    item.appendChild(swatch);
    item.appendChild(name);
    item.appendChild(countBadge);
    item.appendChild(delBtn);

    item.addEventListener('click', () => {
      if (state.activeRelTypeId === rt.id) {
        state.activeRelTypeId = null;
      } else {
        state.activeRelTypeId = rt.id;
        state.activeEntityTypeId = null; // mutual exclusion
      }
      render();
    });

    DOM.relTypesList.appendChild(item);
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
  const rt = !et && state.relationshipTypes.find(r => r.id === state.activeRelTypeId);

  if (et) {
    DOM.activeEntityLabel.textContent = 'Active Entity:';
    DOM.activeEntityBadge.textContent = et.name;
    DOM.activeEntityBadge.style.background = hexToRgba(et.color, 0.2);
    DOM.activeEntityBadge.style.color = et.color;
    DOM.activeEntityBadge.style.borderColor = et.color;
  } else if (rt) {
    DOM.activeEntityLabel.textContent = 'Active Relationship:';
    DOM.activeEntityBadge.textContent = rt.name;
    DOM.activeEntityBadge.style.background = hexToRgba(rt.color, 0.2);
    DOM.activeEntityBadge.style.color = rt.color;
    DOM.activeEntityBadge.style.borderColor = rt.color;
  } else {
    DOM.activeEntityLabel.textContent = 'Active:';
    DOM.activeEntityBadge.textContent = 'None selected';
    DOM.activeEntityBadge.style.background = '';
    DOM.activeEntityBadge.style.color = '';
    DOM.activeEntityBadge.style.borderColor = '';
  }
}

function renderTextDisplay() {
  const text = state.text;

  // Merge entity and relationship annotations
  const allItems = [
    ...state.annotations.map(a => ({ ...a, isRel: false })),
    ...state.relAnnotations.map(a => ({ ...a, isRel: true })),
  ].sort((a, b) => a.start - b.start || a.end - b.end);

  let html = '';
  let cursor = 0;

  for (const item of allItems) {
    if (item.start < cursor) continue; // skip overlapping

    if (item.start > cursor) {
      html += escapeHtml(text.slice(cursor, item.start));
    }

    if (item.isRel) {
      const rt = state.relationshipTypes.find(r => r.id === item.relTypeId);
      const color = rt ? rt.color : '#888';
      const isSelected = item.id === state.selectedRelAnnId;
      const selectedClass = isSelected ? ' selected' : '';
      html += `<span class="ner-rel-span${selectedClass}" data-rel-id="${item.id}" style="border-bottom:2px dashed ${color}; color:${color};" title="${escapeAttr(rt ? rt.name : 'UNKNOWN')}">`;
      html += escapeHtml(text.slice(item.start, item.end));
      html += `<span class="ner-label-tag" style="background:${color}; color:${contrastColor(color)};">\u2194${escapeHtml(rt ? rt.name : '?')}</span>`;
      html += '</span>';
    } else {
      const et = state.entityTypes.find(e => e.id === item.entityTypeId);
      const color = et ? et.color : '#888';
      const bg = hexToRgba(color, 0.22);
      const isSelected = item.id === state.selectedAnnotationId;
      const selectedClass = isSelected ? ' selected' : '';
      html += `<span class="ner-span${selectedClass}" data-ann-id="${item.id}" style="background:${bg}; border-bottom:2px solid ${color}; color:${color};" title="${escapeAttr(et ? et.name : 'UNKNOWN')}">`;
      html += escapeHtml(text.slice(item.start, item.end));
      html += `<span class="ner-label-tag" style="background:${color}; color:${contrastColor(color)};">${escapeHtml(et ? et.name : '?')}</span>`;
      html += '</span>';
    }

    cursor = item.end;
  }

  if (cursor < text.length) {
    html += escapeHtml(text.slice(cursor));
  }

  DOM.textDisplay.innerHTML = html;

  // Attach events to entity spans
  DOM.textDisplay.querySelectorAll('.ner-span').forEach(span => {
    const annId = span.dataset.annId;
    span.addEventListener('click', e => {
      e.stopPropagation();
      state.selectedAnnotationId = (state.selectedAnnotationId === annId) ? null : annId;
      state.selectedRelAnnId = null;
      render();
    });
    span.addEventListener('mouseenter', e => {
      const ann = state.annotations.find(a => a.id === annId);
      const et  = ann && state.entityTypes.find(t => t.id === ann.entityTypeId);
      if (!et) return;
      showTooltip(e, `${et.name}  [${ann.start}\u2013${ann.end}]`);
    });
    span.addEventListener('mouseleave', hideTooltip);
  });

  // Attach events to relationship spans
  DOM.textDisplay.querySelectorAll('.ner-rel-span').forEach(span => {
    const relId = span.dataset.relId;
    span.addEventListener('click', e => {
      e.stopPropagation();
      state.selectedRelAnnId = (state.selectedRelAnnId === relId) ? null : relId;
      state.selectedAnnotationId = null;
      render();
    });
    span.addEventListener('mouseenter', e => {
      const ann = state.relAnnotations.find(a => a.id === relId);
      const rt  = ann && state.relationshipTypes.find(t => t.id === ann.relTypeId);
      if (!rt) return;
      showTooltip(e, `REL: ${rt.name}  [${ann.start}\u2013${ann.end}]`);
    });
    span.addEventListener('mouseleave', hideTooltip);
  });

  // Clicking background deselects
  DOM.textDisplay.addEventListener('click', e => {
    if (e.target === DOM.textDisplay) {
      state.selectedAnnotationId = null;
      state.selectedRelAnnId = null;
      renderTextDisplay();
    }
  }, { once: true });
}

function renderAnnotationsList() {
  const totalCount = state.annotations.length + state.relAnnotations.length;
  DOM.annotationCount.textContent = totalCount;

  if (totalCount === 0) {
    DOM.annotationsList.innerHTML = '<p class="empty-msg">No annotations yet.</p>';
    return;
  }

  DOM.annotationsList.innerHTML = '';

  // Merge and sort by position
  const allItems = [
    ...state.annotations.map(a => ({ ...a, isRel: false })),
    ...state.relAnnotations.map(a => ({ ...a, isRel: true })),
  ].sort((a, b) => a.start - b.start);

  allItems.forEach(ann => {
    if (ann.isRel) {
      const rt    = state.relationshipTypes.find(r => r.id === ann.relTypeId);
      const color = rt ? rt.color : '#888';
      const isSelected = ann.id === state.selectedRelAnnId;

      const item = document.createElement('div');
      item.className = 'annotation-item rel-item' + (isSelected ? ' selected' : '');
      item.dataset.relId = ann.id;

      const colorBar = document.createElement('div');
      colorBar.className = 'annotation-color-bar';
      colorBar.style.background = `repeating-linear-gradient(45deg, ${color}, ${color} 2px, transparent 2px, transparent 5px)`;

      const info = document.createElement('div');
      info.className = 'annotation-info';

      const textEl = document.createElement('div');
      textEl.className = 'annotation-text';
      textEl.title = ann.text;
      textEl.textContent = ann.text;

      const meta = document.createElement('div');
      meta.className = 'annotation-meta';
      meta.textContent = `\u2194 ${rt ? rt.name : 'UNKNOWN'}  \u00b7  ${ann.start}\u2013${ann.end}`;

      info.appendChild(textEl);
      info.appendChild(meta);

      const delBtn = document.createElement('button');
      delBtn.className = 'annotation-delete-btn';
      delBtn.title = 'Delete';
      delBtn.textContent = '\u00d7';
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        deleteRelAnnotation(ann.id);
      });

      item.appendChild(colorBar);
      item.appendChild(info);
      item.appendChild(delBtn);

      item.addEventListener('click', () => {
        state.selectedRelAnnId = (state.selectedRelAnnId === ann.id) ? null : ann.id;
        state.selectedAnnotationId = null;
        render();
        if (state.mode === 'labeling') {
          const span = DOM.textDisplay.querySelector(`[data-rel-id="${ann.id}"]`);
          if (span) span.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });

      DOM.annotationsList.appendChild(item);
    } else {
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
      meta.textContent = `${et ? et.name : 'UNKNOWN'}  \u00b7  ${ann.start}\u2013${ann.end}`;

      info.appendChild(textEl);
      info.appendChild(meta);

      const delBtn = document.createElement('button');
      delBtn.className = 'annotation-delete-btn';
      delBtn.title = 'Delete';
      delBtn.textContent = '\u00d7';
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        deleteAnnotation(ann.id);
      });

      item.appendChild(colorBar);
      item.appendChild(info);
      item.appendChild(delBtn);

      item.addEventListener('click', () => {
        state.selectedAnnotationId = (state.selectedAnnotationId === ann.id) ? null : ann.id;
        state.selectedRelAnnId = null;
        render();
        if (state.mode === 'labeling') {
          const span = DOM.textDisplay.querySelector(`[data-ann-id="${ann.id}"]`);
          if (span) span.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });

      DOM.annotationsList.appendChild(item);
    }
  });
}

function updateDocStatus() {
  const wc = state.text ? state.text.trim().split(/\s+/).filter(Boolean).length : 0;
  DOM.docStatus.textContent = state.text
    ? `${state.text.length} chars \u00b7 ${wc} words`
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

function deleteRelAnnotation(id) {
  pushUndo();
  state.relAnnotations = state.relAnnotations.filter(a => a.id !== id);
  if (state.selectedRelAnnId === id) state.selectedRelAnnId = null;
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

function deleteRelType(id) {
  const count = state.relAnnotations.filter(a => a.relTypeId === id).length;
  const msg = count > 0
    ? `Delete relationship type and its ${count} annotation(s)?`
    : 'Delete this relationship type?';

  confirm(msg, () => {
    pushUndo();
    state.relationshipTypes = state.relationshipTypes.filter(rt => rt.id !== id);
    state.relAnnotations = state.relAnnotations.filter(a => a.relTypeId !== id);
    if (state.activeRelTypeId === id) state.activeRelTypeId = null;
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
    relAnnotations: state.relAnnotations,
    relationshipTypes: state.relationshipTypes,
    activeEntityTypeId: state.activeEntityTypeId,
    activeRelTypeId: state.activeRelTypeId,
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
  state.relAnnotations = prev.relAnnotations || [];
  state.relationshipTypes = prev.relationshipTypes || state.relationshipTypes;
  state.activeEntityTypeId = prev.activeEntityTypeId;
  state.activeRelTypeId = prev.activeRelTypeId || null;
  state.mode = prev.mode;
  state.selectedAnnotationId = null;
  state.selectedRelAnnId = null;
  DOM.rawTextInput.value = state.text;
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

// Increment whenever defaults change; forces type reset.
const ENTITY_SCHEMA_VERSION = 3;

function saveToStorage() {
  try {
    localStorage.setItem('ner-plugin-state', JSON.stringify({
      schemaVersion: ENTITY_SCHEMA_VERSION,
      text: state.text,
      entityTypes: state.entityTypes,
      annotations: state.annotations,
      relationshipTypes: state.relationshipTypes,
      relAnnotations: state.relAnnotations,
      activeEntityTypeId: state.activeEntityTypeId,
      activeRelTypeId: state.activeRelTypeId,
      mode: state.mode,
      nextId,
    }));
  } catch { /* storage quota exceeded, ignore */ }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem('ner-plugin-state');
    if (!raw) return;
    const saved = JSON.parse(raw);
    if ((saved.schemaVersion || 1) >= ENTITY_SCHEMA_VERSION) {
      state.entityTypes       = saved.entityTypes       || state.entityTypes;
      state.relationshipTypes = saved.relationshipTypes  || state.relationshipTypes;
    }
    state.text               = saved.text               || '';
    state.annotations        = saved.annotations        || [];
    state.relAnnotations     = saved.relAnnotations     || [];
    state.activeEntityTypeId = saved.activeEntityTypeId  || null;
    state.activeRelTypeId    = saved.activeRelTypeId     || null;
    state.mode               = saved.mode               || 'input';
    nextId                   = saved.nextId              || nextId;
    DOM.rawTextInput.value   = state.text;
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

function getTextOffset(container, node, nodeOffset) {
  let offset = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);

  while (walker.nextNode()) {
    const current = walker.currentNode;
    if (current === node) {
      return offset + nodeOffset;
    }
    if (isInsideLabelTag(current)) continue;
    offset += current.textContent.length;
  }

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
