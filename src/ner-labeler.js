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

const DEFAULT_ATTR_TYPES = [
  { name: 'Date',        color: '#e67e22' },
  { name: 'Value',       color: '#27ae60' },
  { name: 'Location',    color: '#16a085' },
  { name: 'Nationality', color: '#8e44ad' },
  { name: 'Percentage',  color: '#e74c3c' },
  { name: 'Duration',    color: '#2980b9' },
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
  attrTypes: [],
  // {id, start, end, text, attrTypeId, parentId, parentType:'entity'|'relationship'}
  attrAnnotations: [],
  activeEntityTypeId: null,
  activeRelTypeId: null,
  activeAttrTypeId: null,
  selectedAnnotationId: null,
  selectedRelAnnId: null,
  selectedAttrAnnId: null,
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
  attrTypesList:      $('attr-types-list'),
  newAttrName:        $('new-attr-name'),
  newAttrColor:       $('new-attr-color'),
  btnAddAttr:         $('btn-add-attr'),
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
  btnExportXlsx:      $('btn-export-xlsx'),
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
  DEFAULT_ATTR_TYPES.forEach(at => {
    state.attrTypes.push({ id: uid(), name: at.name, color: at.color });
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

  DOM.btnAddAttr.addEventListener('click', handleAddAttrType);
  DOM.newAttrName.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddAttrType();
  });

  DOM.rawTextInput.addEventListener('input', () => {
    DOM.charCount.textContent = `${DOM.rawTextInput.value.length} characters`;
  });

  // Paste appends at the cursor naturally — update char count after the
  // paste event has populated the textarea value.
  DOM.rawTextInput.addEventListener('paste', () => {
    setTimeout(() => {
      DOM.charCount.textContent = `${DOM.rawTextInput.value.length} characters`;
    }, 0);
  });

  (DOM.btnAutoLabel || document.getElementById('btn-auto-label'))
    ?.addEventListener('click', handleAutoLabel);

  // ── Gemini API key management ────────────────────────────────────────────
  // The key lives ONLY in localStorage — it is never written to any file and
  // is therefore never at risk of being committed or pushed to a repository.
  _geminiUpdateStatusDot();
  document.getElementById('btn-save-gemini-key')?.addEventListener('click', () => {
    const key = document.getElementById('gemini-api-key-input')?.value.trim();
    if (!key) return;
    localStorage.setItem('gemini-api-key', key);
    document.getElementById('gemini-api-key-input').value = '';
    _geminiUpdateStatusDot();
  });
  document.getElementById('btn-clear-gemini-key')?.addEventListener('click', () => {
    localStorage.removeItem('gemini-api-key');
    const inp = document.getElementById('gemini-api-key-input');
    if (inp) inp.value = '';
    _geminiUpdateStatusDot();
  });

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
      state.attrAnnotations = [];
      render();
    });
  });

  DOM.btnExport.addEventListener('click', handleExport);
  DOM.btnExportXlsx.addEventListener('click', handleExportXlsx);
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

function handleAddAttrType() {
  const name = DOM.newAttrName.value.trim().toUpperCase();
  if (!name) return;
  if (state.attrTypes.find(at => at.name === name)) {
    flashInput(DOM.newAttrName, 'Attribute type already exists');
    return;
  }
  state.attrTypes.push({ id: uid(), name, color: DOM.newAttrColor.value });
  DOM.newAttrName.value = '';
  DOM.newAttrColor.value = randomColor();
  saveToStorage();
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// NER Engine — Entity Detection
// ─────────────────────────────────────────────────────────────────────────────

const _NER_DATE_RE = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember))\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b|\b(?:Q[1-4]|H[12])\s+\d{4}\b/gi;

const _NER_MONEY_RE = /\bRM\s*[\d,.]+(?:\s*(?:million|billion|trillion|mil|bil|[MBmbt]))?\b|\$\s*[\d,]+(?:\.\d{1,2})?(?:\s*(?:million|billion|trillion|[MBT]))?\b|\b[\d,]+(?:\.\d{1,2})?\s*(?:million|billion|trillion)?\s*(?:USD|EUR|GBP|JPY|CAD|AUD|MYR|SGD|HKD|dollars?|euros?|pounds?|yuan|yen|ringgit|sen)\b/gi;

const _NER_ORG_RE = /\b(?:[A-Z][a-zA-Z&''\-]+(?:\s+(?:&\s+)?[A-Z][a-zA-Z&''\-]+)*\s+(?:Inc\.?|Corp\.?|Ltd\.?|LLC|LLP|PLC|Co\.?|Company|Group|Holdings?|Foundation|Institute|University|College|School|Hospital|Bank|Fund|Trust|Association|Federation|Union|Alliance|Organization|Department|Agency|Bureau|Ministry|Commission|Council|Authority|Corporation|Industries|International|Global|National|Systems?|Solutions?|Technologies?|Services?|Networks?|Labs?|Media|Press|Times|Post|Capital|Berhad|Bhd\.?|Sdn\s+Bhd\.?|Ventures?|Partners?|Consultants?|Resources?))\b/g;

// Compound "place/name + org-indicator" pattern.
// Matches 1-4 capitalized words followed by a word that signals an organisation,
// including lowercase variants ("government", "ministry") that _NER_ORG_RE misses.
// Added to the results BEFORE location detection so the longer ORG span wins
// the de-overlap step over a shorter bare LOCATION match.
// e.g.  "Sarawak government"      → ORG   (beats "Sarawak" → LOCATION)
//       "Sarawak Energy Berhad"   → ORG   (beats "Sarawak" → LOCATION)
//       "Johor Port Authority"    → ORG   (beats "Johor"   → LOCATION)
//       "Malaysia Airlines"       → ORG   (beats "Malaysia"→ LOCATION)
const _COMPOUND_ORG_RE = new RegExp(
  '\\b[A-Z][\\w\'-]{1,}(?:\\s+[A-Z][\\w\'-]{1,}){0,3}\\s+' +
  '(?:government|governments|govt|authority|authorities|ministry|ministries|' +
  'council[s]?|commission[s]?|parliament|senate|assembl(?:y|ies)|' +
  'department[s]?|dept|bureau[x]?|agenc(?:y|ies)|administration|' +
  'court[s]?|board[s]?|office[s]?|foundation[s]?|fund[s]?|' +
  'corporation[s]?|corp|holdings|group[s]?|enterprise[s]?|berhad|bhd|' +
  'energy|power|water[s]?|gas|oil|petroleum|airline[s]?|airport[s]?|port[s]?|' +
  'railway[s]?|metro|transit|expressway[s]?|highway[s]?|' +
  'bank[s]?|finance|investment[s]?|capital|securities|development|' +
  'electricit(?:y|ies)|telecom(?:munications?)?|broadcasting|' +
  'engineering|construction|property|properties|realty|' +
  'insurance|healthcare|pharmaceutical[s]?|mining|resources?|' +
  'plantation[s]?|logistics|shipping|aviation|aerospace)\\b',
  'gi'
);

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

// ─── Malaysian company name pattern ─────────────────────────────────────────
// Captures: core name (group 1) + optional qualifier in parens (group 2) + legal suffix
// Examples:
//   "Axiata Group (M) Sdn Bhd"  →  core "Axiata Group"
//   "Gamuda Berhad"             →  core "Gamuda"
//   "IHH Healthcare Berhad"     →  core "IHH Healthcare"
//   "ABC Corp Pte Ltd"          →  core "ABC Corp"
const _MY_COMPANY_RE = /\b([A-Z][A-Za-z0-9&''\-\.]+(?:\s+[A-Z&][A-Za-z0-9&''\-\.]*){0,5})(\s*\([A-Za-z0-9\s\.\-]{1,25}\))?\s+(Sdn\.?\s*Bhd\.?|Sendirian\s+Berhad|Berhad|Bhd\.?|Pte\.?\s*Ltd\.?)\b/g;

/**
 * Detect full Malaysian company names (core name + optional qualifier + legal suffix)
 * as single entities, then track short-form aliases used in subsequent mentions.
 *
 * Short-form alias rules:
 *  - The coreName (e.g. "Axiata Group") is always an alias.
 *  - The first word is used as an alias ONLY when it is an all-caps acronym
 *    (e.g. "CIMB", "IHH", "RHB") — single mixed-case words are too generic.
 *
 * @param {string} text
 * @returns {Array<{start,end,type:'ORG'}>}
 */
function detectMalaysianCompanies(text) {
  const results = [];
  const seen = [];  // [{fullStart, fullEnd, shortForms}]
  let m;

  _MY_COMPANY_RE.lastIndex = 0;
  while ((m = _MY_COMPANY_RE.exec(text)) !== null) {
    const fullStart = m.index;
    const fullEnd   = m.index + m[0].length;
    const coreName  = m[1].trim();

    results.push({ start: fullStart, end: fullEnd, type: 'ORG' });

    // Build candidate short forms
    const shortForms = [coreName];
    const words = coreName.split(/\s+/);
    // Only add first-word alias if it is an all-caps acronym (avoids generic word false positives)
    if (words.length > 1 && /^[A-Z]{2,6}$/.test(words[0])) {
      shortForms.push(words[0]);
    }
    seen.push({ fullStart, fullEnd, shortForms });
  }

  // Alias pass: tag every subsequent (and prior) occurrence of each short form
  for (const co of seen) {
    for (const sf of co.shortForms) {
      const escaped = sf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const sfRe = new RegExp(`\\b${escaped}\\b`, 'g');
      sfRe.lastIndex = 0;
      while ((m = sfRe.exec(text)) !== null) {
        const s = m.index, e = m.index + m[0].length;
        // Skip positions that fall inside the full-name span (already covered)
        if (s >= co.fullStart && e <= co.fullEnd) continue;
        results.push({ start: s, end: e, type: 'ORG' });
      }
    }
  }

  return results;
}

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

  // ── Pre-scan: discover "Full Name (ACRONYM)" definitions ──────────────────
  // Build a map of  acronym → { wholeStart, wholeEnd }  for the first
  // occurrence of each "Full Name (ACRONYM)" pattern.  These acronyms are
  // excluded from the generic capitalised-word scanner so they don't get
  // mis-typed as ORG; they are re-introduced with the correct inherited type
  // in the post-processing pass at the bottom of this function.
  const acronymDefs = new Map();
  {
    const defRe = /\b([A-Z][A-Za-z &,\-']{2,80}?)\s+\(([A-Z][A-Z0-9]{1,10})\)/g;
    let ad;
    while ((ad = defRe.exec(text)) !== null)
      if (!acronymDefs.has(ad[2]))  // first definition wins
        acronymDefs.set(ad[2], { wholeStart: ad.index, wholeEnd: ad.index + ad[0].length });
  }

  function add(re, type) {
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null)
      res.push({ start: m.index, end: m.index + m[0].length, type });
  }

  add(_NER_DATE_RE, 'DATE');
  add(_NER_MONEY_RE, 'MONEY');
  add(_NER_PHYSICAL_ITEM_RE, 'PHYSICAL_ITEM');

  // Malaysian company names: full form ("XYZ Holdings (M) Sdn Bhd") + short-form aliases
  // Run BEFORE generic _NER_ORG_RE so de-overlap keeps the longer, more precise match
  detectMalaysianCompanies(text).forEach(r => res.push(r));
  add(_NER_ORG_RE, 'ORG');

  // Acronyms → ORG (with expanded skip list).
  // Acronyms that appear in a "Full Name (ACRONYM)" definition are excluded here
  // and handled in the resolution pass below so they inherit the parent entity type.
  const aRe = /\b[A-Z]{2,5}\b/g;
  while ((m = aRe.exec(text)) !== null)
    if (!_NER_ACRONYM_SKIP.has(m[0]) && !acronymDefs.has(m[0]))
      res.push({ start: m.index, end: m.index + m[0].length, type: 'ORG' });

  // Known first names → PERSON
  const pRe = /\b([A-Z][a-z]{1,15})(?:\s+[A-Z][a-z]{1,15}){1,3}\b/g;
  while ((m = pRe.exec(text)) !== null)
    if (_NER_FIRST_NAMES.has(m[0].split(' ')[0]))
      res.push({ start: m.index, end: m.index + m[0].length, type: 'PERSON' });

  // ── Compound "place/name + org-indicator" → ORG ──────────────────────────
  // Must run BEFORE the bare location passes so that "Sarawak government"
  // produces a longer ORG span; de-overlap will then discard the shorter
  // "Sarawak" → LOCATION span in favour of the compound match.
  add(_COMPOUND_ORG_RE, 'ORG');

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

  // ── Acronym-definition resolution pass ────────────────────────────────────
  // For each "Full Name (ACRONYM)" pattern found above:
  //   1. Locate the annotation that covers the full-name portion of the span.
  //   2. Extend that annotation to also include the "(ACRONYM)" suffix, so the
  //      bracketed definition is part of the same entity rather than a gap.
  //   3. Tag every subsequent standalone occurrence of ACRONYM with the same
  //      entity type as the full name (not the default ORG type).
  if (acronymDefs.size) {
    for (const [acronym, { wholeStart, wholeEnd }] of acronymDefs) {
      // Find the annotation whose span sits within the definition but before
      // the opening parenthesis (i.e. it covers the full-name text only).
      const parent = out.find(r => r.start >= wholeStart && r.end < wholeEnd);
      if (!parent) continue;  // full name wasn't detected by any rule — skip

      // Stretch the annotation to cover the whole "Full Name (ACRONYM)" span
      parent.end = wholeEnd;

      // Add all standalone occurrences of the acronym outside the definition
      const escaped = acronym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const acRe = new RegExp(`\\b${escaped}\\b`, 'g');
      let acm;
      while ((acm = acRe.exec(text)) !== null) {
        if (acm.index >= wholeStart && acm.index < wholeEnd) continue; // skip definition occurrence
        const s = acm.index, e = acm.index + acronym.length;
        if (!out.some(r => s < r.end && e > r.start))  // not overlapping anything
          out.push({ start: s, end: e, type: parent.type });
      }
    }
    // Re-sort and de-overlap after insertions
    out.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    let i = 0;
    while (i < out.length - 1) {
      if (out[i + 1].start < out[i].end) out.splice(i + 1, 1);
      else i++;
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// NER Engine — Relationship Detection
// ─────────────────────────────────────────────────────────────────────────────

// _REL_PATTERNS: each entry covers all synonyms, tenses, and common variants.
// Patterns are case-insensitive and use word boundaries to avoid false matches.
const _REL_PATTERNS = [
  {
    name: 'Operates',
    patterns: [
      // operate / operates / operated / operating / operation(s)
      /\boperat(?:e[sd]?|es|ing|ion[s]?)\b/gi,
      // manage / manages / managed / managing / management
      /\bmanag(?:e[sd]?|es|ing|ement)\b/gi,
      // run / runs / ran / running
      /\brun[s]?\b/gi, /\bran\b/gi, /\brunning\b/gi,
      // conduct / conducts / conducted / conducting
      /\bconduct(?:s|ed|ing)?\b/gi,
      // oversee / oversees / oversaw / overseeing / oversight
      /\boversee[s]?\b/gi, /\boversaw\b/gi, /\boverseeing\b/gi,
      // administer / administers / administered / administering
      /\badminister(?:s|ed|ing)?\b/gi,
      // handle / handles / handled / handling
      /\bhandl(?:e[sd]?|es|ing)\b/gi,
      // control / controls / controlled / controlling
      /\bcontrol(?:s|led|ling)?\b/gi,
      // maintain / maintains / maintained / maintaining
      /\bmaintain(?:s|ed|ing)?\b/gi,
    ]
  },
  {
    name: 'Owes / In Debt',
    patterns: [
      // owe / owes / owed / owing
      /\bow(?:e[sd]?|es|ing)\b/gi,
      // borrow / borrows / borrowed / borrowing
      /\bborrow(?:s|ed|ing)?\b/gi,
      // in debt / indebted / debt(s)
      /\bin\s+debt\b/gi, /\bindebted\b/gi, /\bdebt[s]?\b/gi,
      // liability / liabilities
      /\bliabilit(?:y|ies)\b/gi,
      // default / defaults / defaulted / defaulting (on)
      /\bdefault(?:s|ed|ing)?(?:\s+on)?\b/gi,
      // payable / receivable
      /\bpayable\b/gi, /\breceivable\b/gi,
      // obligation / obligations
      /\bobligation[s]?\b/gi,
      // outstanding / arrears
      /\boutstanding\b/gi, /\barrears\b/gi,
    ]
  },
  {
    name: 'Sells / Divests',
    patterns: [
      // sell / sells / sold / selling
      /\bsell(?:s|ing)?\b/gi, /\bsold\b/gi,
      // dispose / disposes / disposed / disposing / disposal
      /\bdispos(?:e[sd]?|es|ing|al[s]?)\b/gi,
      // divest / divests / divested / divesting / divestiture / divestment
      /\bdivest(?:s|ed|ing|iture[s]?|ment[s]?)?\b/gi,
      // offload / offloads / offloaded / offloading
      /\boffload(?:s|ed|ing)?\b/gi,
      // transfer / transfers / transferred / transferring
      /\btransfer(?:s|red|ring)?\b/gi,
      // relinquish / relinquishes / relinquished / relinquishing
      /\brelinquish(?:es|ed|ing)?\b/gi,
      // exit / exits / exited / exiting (business)
      /\bexit(?:s|ed|ing)?\b/gi,
      // let go of / parting with
      /\bparting\s+with\b/gi,
      // spin off / spun off / spinning off
      /\bspin(?:s|ning)?\s+off\b/gi, /\bspun\s+off\b/gi,
      // carve out / carved out
      /\bcarve[sd]?\s+out\b/gi, /\bcarving\s+out\b/gi,
    ]
  },
  {
    name: 'Acquires',
    patterns: [
      // acquire / acquires / acquired / acquiring / acquisition(s)
      /\bacquir(?:e[sd]?|es|ing)\b/gi, /\bacquisition[s]?\b/gi,
      // buy / buys / bought / buying
      /\bbuy(?:s|ing)?\b/gi, /\bbought\b/gi,
      // purchase / purchases / purchased / purchasing
      /\bpurchas(?:e[sd]?|es|ing)\b/gi,
      // take over / takes over / took over / taking over
      /\btak(?:e[s]?|ing)\s+over\b/gi, /\btook\s+over\b/gi,
      // merge / merges / merged / merging / merger(s)
      /\bmerg(?:e[sd]?|es|ing|er[s]?)\b/gi,
      // takeover(s)
      /\btakeover[s]?\b/gi,
      // absorb / absorbs / absorbed / absorbing
      /\babsorb(?:s|ed|ing)?\b/gi,
      // consolidate / consolidates / consolidated / consolidation
      /\bconsolidat(?:e[sd]?|es|ing|ion)?\b/gi,
      // bid for / bids for / bidding for
      /\bbid(?:s|ding)?\s+for\b/gi,
      // snap up / snapped up
      /\bsnap(?:s|ped|ping)?\s+up\b/gi,
      // invest in / invested in / investing in
      /\binvest(?:s|ed|ing)?\s+in\b/gi,
    ]
  },
  {
    name: 'Partners With',
    patterns: [
      // partner / partners / partnered / partnering / partnership(s)
      /\bpartner(?:s|ed|ing|ship[s]?)?\b/gi,
      // collaborate / collaborates / collaborated / collaborating / collaboration
      /\bcollaborat(?:e[sd]?|es|ing|ion)?\b/gi,
      // joint venture(s) / JV
      /\bjoint\s+venture[s]?\b/gi,
      // consortium / consortiums / consortia
      /\bconsortia?\b/gi,
      // alliance(s)
      /\balliance[s]?\b/gi,
      // team up / teamed up / teams up / teaming up
      /\bteam(?:s|ed|ing)?\s+up\b/gi,
      // join forces / joining forces
      /\bjoin(?:s|ed|ing)?\s+forces\b/gi,
      // cooperate / cooperates / cooperated / cooperating / cooperation
      /\bcooperat(?:e[sd]?|es|ing|ion)?\b/gi,
      // tie-up / tie up
      /\btie[\-\s]up[s]?\b/gi,
      // work with / working with / worked with
      /\bwork(?:s|ed|ing)?\s+with\b/gi,
      // align / aligns / aligned / aligning
      /\balign(?:s|ed|ing)?\b/gi,
    ]
  },
  {
    name: 'Subsidiary Of',
    patterns: [
      // subsidiary / subsidiaries
      /\bsubsidiar(?:y|ies)\b/gi,
      // affiliate / affiliates / affiliated / affiliating
      /\baffiliat(?:e[sd]?|es|ing|ion)?\b/gi,
      // wholly-owned / wholly owned
      /\bwholly[\-\s]owned\b/gi,
      // parent company / parent companies / parent of
      /\bparent\s+compan(?:y|ies)\b/gi, /\bparent\s+of\b/gi,
      // unit of / arm of / branch of / division of
      /\bunit\s+of\b/gi, /\barm\s+of\b/gi,
      /\bbranch\s+of\b/gi, /\bdivision\s+of\b/gi,
      // owned under / controlled under
      /\bowned\s+(?:by|under)\b/gi, /\bcontrolled\s+under\b/gi,
      // a unit / a subsidiary
      /\ba\s+(?:listed\s+)?(?:subsidiary|unit)\s+of\b/gi,
    ]
  },
  {
    name: 'Contracts / Awarded',
    patterns: [
      // award / awards / awarded / awarding
      /\baward(?:s|ed|ing)?\b/gi,
      // contract / contracts / contracted / contracting
      /\bcontract(?:s|ed|ing)?\b/gi,
      // tender / tenders / tendered / tendering
      /\btender(?:s|ed|ing)?\b/gi,
      // bid / bids / bidding (on contract)
      /\bbid(?:s|ding)?\b/gi,
      // procure / procures / procured / procuring / procurement
      /\bprocur(?:e[sd]?|es|ing|ement)?\b/gi,
      // commission / commissions / commissioned / commissioning
      /\bcommission(?:s|ed|ing)?\b/gi,
      // supply / supplies / supplied / supplying
      /\bsuppl(?:y(?:ing)?|ies|ied)\b/gi,
      // deliver / delivers / delivered / delivering / delivery
      /\bdeliver(?:s|ed|ing|y)?\b/gi,
      // engage / engages / engaged / engaging
      /\bengag(?:e[sd]?|es|ing)\b/gi,
      // sign a deal / signed a deal / signing a deal
      /\bsign(?:s|ed|ing)?\s+(?:a\s+)?(?:deal|agreement|contract|MOU|letter\s+of\s+intent)\b/gi,
      // ink a deal / inked a deal
      /\bink(?:s|ed|ing)?\s+(?:a\s+)?(?:deal|agreement|contract)\b/gi,
    ]
  },
  {
    name: 'Listed On',
    patterns: [
      // listed on / listing on
      /\blist(?:s|ed|ing)?\s+on\b/gi,
      // IPO
      /\bIPO\b/g,
      // float / floats / floated / floating
      /\bfloat(?:s|ed|ing)?\b/gi,
      // trade / trades / traded / trading on
      /\btrad(?:e[sd]?|es|ing)\s+on\b/gi,
      // delist / delists / delisted / delisting
      /\bdelist(?:s|ed|ing)?\b/gi,
      // Bursa / Bursa Malaysia / stock exchange
      /\bBursa\b/gi, /\bstock\s+exchange\b/gi,
      // go public / went public / goes public / going public
      /\bgo(?:es|ing)?\s+public\b/gi, /\bwent\s+public\b/gi,
      // make its debut / debuted
      /\bdebut(?:s|ed|ing)?\b/gi,
    ]
  },
  {
    name: 'Owned By',
    patterns: [
      // own / owns / owned / owning
      /\bown(?:s|ed|ing)?\b/gi,
      // hold / holds / held / holding (a stake)
      /\bhold(?:s|ing)?\b/gi, /\bheld\b/gi,
      // belong / belongs / belonged to
      /\bbelong(?:s|ed|ing)?\s+to\b/gi,
      // shareholder(s) / stockholder(s)
      /\bshareholder[s]?\b/gi, /\bstockholder[s]?\b/gi,
      // stakeholder(s)
      /\bstakeholder[s]?\b/gi,
      // majority stake / majority owner / majority shareholder
      /\bmajority\s+(?:stake|owner|shareholder|interest)\b/gi,
      // equity stake / equity interest / equity holding
      /\bequity\s+(?:stake|interest|holding)\b/gi,
      // minority stake / minority interest
      /\bminority\s+(?:stake|interest)\b/gi,
    ]
  },
  {
    name: 'Appointed',
    patterns: [
      // appoint / appoints / appointed / appointing / appointment(s)
      /\bappoint(?:s|ed|ing|ment[s]?)?\b/gi,
      // nominate / nominates / nominated / nominating / nomination
      /\bnominat(?:e[sd]?|es|ing|ion[s]?)?\b/gi,
      // name / named / naming as (CEO)
      /\bnam(?:e[sd]?|es|ing)\b/gi,
      // resign / resigns / resigned / resigning / resignation
      /\bresign(?:s|ed|ing|ation[s]?)?\b/gi,
      // step down / steps down / stepped down / stepping down
      /\bstep(?:s|ped|ping)?\s+down\b/gi,
      // retire / retires / retired / retiring / retirement
      /\bretir(?:e[sd]?|es|ing|ement)?\b/gi,
      // hire / hires / hired / hiring
      /\bhir(?:e[sd]?|es|ing)\b/gi,
      // promote / promotes / promoted / promoting / promotion
      /\bpromot(?:e[sd]?|es|ing|ion[s]?)?\b/gi,
      // succeed / succeeds / succeeded / succeeding / successor
      /\bsuccee(?:d[sd]?|ds|ding)\b/gi, /\bsuccessor[s]?\b/gi,
      // take over from / took over from
      /\btook?\s+over\s+(?:as|from)\b/gi,
    ]
  },
  {
    name: 'Raises Capital',
    patterns: [
      // rights issue(s)
      /\brights?\s+issue[s]?\b/gi,
      // placement / private placement
      /\bprivate\s+placement[s]?\b/gi, /\bplacement[s]?\b/gi,
      // raise / raises / raised / raising (funds / capital / money / financing)
      /\brais(?:e[sd]?|es|ing)\s+(?:fund[s]?|capital|money|financing)\b/gi,
      // bond issuance / bond offering
      /\bbond[s]?\s+(?:issuance|offering)\b/gi,
      // sukuk
      /\bsukuk\b/gi,
      // warrant(s)
      /\bwarrant[s]?\b/gi,
      // fund-raise / fund-raising
      /\bfund[\-\s]rais(?:e[sd]?|ing)\b/gi,
      // debt issuance / equity issuance
      /\b(?:debt|equity)\s+issuance\b/gi,
      // ICULS / RCULS / ESOS (capital instruments)
      /\bICULS\b/g, /\bRCULS\b/g, /\bESOS\b/g,
    ]
  },
  {
    name: 'Located In',
    patterns: [
      // based in / base operations in
      /\bbas(?:e[sd]?|es|ing)\s+in\b/gi,
      // headquartered in / headquartered at / headquarters in
      /\bheadquarter(?:s|ed)?\s+in\b/gi,
      // situated in / situate in
      /\bsituat(?:e[sd]?|es|ing)?\s+in\b/gi,
      // located in / locate in
      /\blocat(?:e[sd]?|es|ing)?\s+in\b/gi,
      // operates in / operating in / operated in / operate at / from
      /\boperat(?:e[sd]?|es|ing)\s+(?:in|at|from|across)\b/gi,
      // established in
      /\bestablish(?:es|ed|ing)?\s+in\b/gi,
      // set up in / sets up in
      /\bset(?:s|ting)?\s+up\s+in\b/gi,
      // present in / presence in
      /\bpres(?:ent|ence)\s+in\b/gi,
      // expand / expands / expanded / expanding into
      /\bexpand(?:s|ed|ing)?\s+(?:in|into)\b/gi,
    ]
  },
];

/**
 * Find the nearest entity annotation before (subject) and after (object) a
 * relationship keyword at [relStart, relEnd].  Returns annotation IDs or null.
 *
 * Rule of thumb: subject must be a Company; object must be a Company or Location.
 * entityTypes is passed so we can filter by type name.
 */
function findLinkedEntities(relStart, relEnd, entityAnnotations, maxDist, entityTypes) {
  const subjectTypeIds = new Set(
    (entityTypes || []).filter(t => t.name.toUpperCase() === 'COMPANY').map(t => t.id)
  );
  const objectTypeIds = new Set(
    (entityTypes || []).filter(t => ['COMPANY', 'LOCATION'].includes(t.name.toUpperCase())).map(t => t.id)
  );

  let subject = null, subjectDist = maxDist + 1;
  let object  = null, objectDist  = maxDist + 1;

  for (const ann of entityAnnotations) {
    if (ann.end <= relStart) {
      if (subjectTypeIds.size && !subjectTypeIds.has(ann.entityTypeId)) continue;
      const d = relStart - ann.end;
      if (d < subjectDist) { subjectDist = d; subject = ann; }
    } else if (ann.start >= relEnd) {
      if (objectTypeIds.size && !objectTypeIds.has(ann.entityTypeId)) continue;
      const d = ann.start - relEnd;
      if (d < objectDist)  { objectDist  = d; object  = ann; }
    }
  }
  return { subjectId: subject ? subject.id : null, objectId: object ? object.id : null };
}

/**
 * Detect relationship keywords in text, then link each to the nearest entity
 * before (subject) and after (object) within MAX_LINK_DIST characters.
 * @param {string} text
 * @param {Array}  entityAnnotations  – already-built entity annotation array
 * @returns {Array} detections with { start, end, name, subjectId, objectId }
 */
function autoDetectRelationships(text, entityAnnotations, entityTypes) {
  const MAX_LINK_DIST = 300;
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

  // De-overlap (longest match wins at each position)
  res.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const deduped = []; let last = -1;
  for (const r of res) { if (r.start >= last) { deduped.push(r); last = r.end; } }

  // Link each keyword to nearest subject/object entity
  return deduped.map(r => ({
    ...r,
    ...findLinkedEntities(r.start, r.end, entityAnnotations, MAX_LINK_DIST, entityTypes),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Gemini AI Integration
// ─────────────────────────────────────────────────────────────────────────────

/** Updates the green/grey status dot next to the "AI (Gemini)" heading. */
function _geminiUpdateStatusDot() {
  const dot = document.getElementById('gemini-status-dot');
  if (!dot) return;
  const hasKey = !!localStorage.getItem('gemini-api-key');
  dot.classList.toggle('active', hasKey);
  dot.title = hasKey ? 'Gemini key saved — AI-assisted labeling enabled' : 'Gemini key not set';
}

/**
 * Calls Gemini 2.5 Flash to extract named entities from `text`.
 * Returns an array of {start, end, type} in the same format as autoDetectNER,
 * where `type` is one of the _NER_TYPE_MAP keys (PERSON, ORG, LOCATION, DATE,
 * MONEY, PHYSICAL_ITEM) or a direct entity-type name (COMPANY, LOCATION …).
 *
 * The key is read from localStorage — it never appears in source code.
 */
async function callGeminiNER(text, apiKey) {
  // Build the list of entity type names active in this session so the prompt
  // stays aligned with whatever types the user has configured.
  const typeNames = state.entityTypes.map(e => e.name).join(', ');

  const prompt =
    `You are a Named Entity Recognition expert specialising in Malaysian financial and business news.\n` +
    `Extract ALL named entities from the text. Return ONLY a minified JSON array — no explanation, no markdown.\n\n` +
    `Entity types to use (choose the closest match): ${typeNames}\n\n` +
    `Key rules:\n` +
    `- Prefer the LONGEST meaningful phrase over a single head word.\n` +
    `  "Sarawak government"        → COMPANY   (NOT "Sarawak" → LOCATION)\n` +
    `  "Sarawak Energy Berhad"     → COMPANY\n` +
    `  "Malaysia Airlines"         → COMPANY\n` +
    `  "Johor Port Authority"      → COMPANY\n` +
    `- Government bodies, agencies, ministries, authorities → COMPANY\n` +
    `- A place name with no organisational context → LOCATION\n` +
    `- Full person names → PEOPLE\n` +
    `- Dates, years, time periods → TIME\n` +
    `- Monetary figures, physical assets → ITEM\n` +
    `- List each DISTINCT entity phrase once; the app will find all occurrences.\n\n` +
    `Output format exactly: [{"text":"entity text","type":"TYPE"}, ...]\n\n` +
    `Text:\n${text}`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
    }
  );
  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gemini ${resp.status}: ${err}`);
  }

  const data   = await resp.json();
  const raw    = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
  const parsed = JSON.parse(raw);

  // Map Gemini type names → internal NER keys for _NER_TYPE_MAP resolution.
  // Gemini may return the entity-type names directly ("COMPANY", "LOCATION"…)
  // or common aliases ("ORG", "PERSON"…); both are handled below.
  const TYPE_ALIAS = {
    ORG: 'ORG', ORGANISATION: 'ORG', ORGANIZATION: 'ORG', COMPANY: 'ORG',
    PERSON: 'PERSON', PEOPLE: 'PERSON', PER: 'PERSON',
    LOC: 'LOCATION', GPE: 'LOCATION',
    DATE: 'DATE', TIME: 'DATE',
    MONEY: 'MONEY', ITEM: 'MONEY',
    PHYSICAL_ITEM: 'PHYSICAL_ITEM',
  };

  // Build text→type map (longer phrases win if ambiguous).
  const entityMap = new Map();
  for (const ent of parsed) {
    if (!ent?.text || !ent?.type) continue;
    const t = TYPE_ALIAS[ent.type.toUpperCase()] ?? ent.type.toUpperCase();
    const existing = entityMap.get(ent.text);
    // Keep whichever was already stored; first occurrence wins.
    if (!existing) entityMap.set(ent.text, t);
  }

  // Find ALL occurrences of each entity phrase in the text.
  const result = [];
  for (const [phrase, type] of entityMap) {
    let pos = 0;
    while (true) {
      const idx = text.indexOf(phrase, pos);
      if (idx === -1) break;
      result.push({ start: idx, end: idx + phrase.length, type });
      pos = idx + 1;
    }
  }
  return result;
}

/**
 * Merges Gemini detections (higher confidence) with regex detections (fallback).
 * Gemini spans take priority; regex spans that don't overlap any Gemini span
 * are appended so nothing is lost.
 */
function _mergeNERDetections(gemini, regex) {
  // De-overlap gemini results first (sort start asc, length desc → keep longest)
  gemini.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const primary = [];
  let last = -1;
  for (const r of gemini) {
    if (r.start >= last) { primary.push(r); last = r.end; }
  }

  // Add regex results that don't overlap any primary span.
  for (const r of regex) {
    const overlaps = primary.some(p => r.start < p.end && r.end > p.start);
    if (!overlaps) primary.push(r);
  }

  // Final sort by position.
  primary.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const out = []; last = -1;
  for (const r of primary) {
    if (r.start >= last) { out.push(r); last = r.end; }
  }
  return out;
}

// Auto-Label Handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleAutoLabel() {
  const text = DOM.rawTextInput.value;
  if (!text.trim()) return;

  // ── Entity detection: Gemini (if key set) merged with regex fallback ──────
  const apiKey  = localStorage.getItem('gemini-api-key');
  const btnAuto = DOM.btnAutoLabel;
  let detections;

  if (apiKey) {
    // Show loading state while waiting for the API response.
    if (btnAuto) { btnAuto.textContent = 'Labeling…'; btnAuto.classList.add('loading'); }
    try {
      const [geminiDets, regexDets] = await Promise.all([
        callGeminiNER(text, apiKey),
        Promise.resolve(autoDetectNER(text)),
      ]);
      detections = _mergeNERDetections(geminiDets, regexDets);
    } catch (err) {
      console.warn('Gemini NER failed, falling back to regex:', err);
      // Surface a brief non-blocking notice so the user knows what happened.
      const notice = document.createElement('div');
      notice.textContent = `Gemini error — using regex only. (${err.message})`;
      Object.assign(notice.style, {
        position:'fixed', bottom:'16px', right:'16px', zIndex:'9999',
        background:'#f87171', color:'#fff', padding:'8px 14px',
        borderRadius:'6px', fontSize:'12px', maxWidth:'320px',
      });
      document.body.appendChild(notice);
      setTimeout(() => notice.remove(), 6000);
      detections = autoDetectNER(text);
    } finally {
      if (btnAuto) { btnAuto.textContent = 'Auto-Label'; btnAuto.classList.remove('loading'); }
    }
  } else {
    detections = autoDetectNER(text);
  }

  pushUndo();
  state.text = text;
  state.mode = 'labeling';
  state.annotations = [];
  state.relAnnotations = [];
  state.attrAnnotations = [];

  let entAdded = 0;
  detections.forEach(det => {
    // det.type may be an internal NER key (from regex) or an entity-type name
    // (from Gemini).  Try both mappings so either path works.
    const targetName = _NER_TYPE_MAP[det.type] ?? det.type;
    if (!targetName) return;
    const et = state.entityTypes.find(e => e.name.toUpperCase() === targetName.toUpperCase());
    if (!et) return;
    const overlaps = state.annotations.some(a => !(det.end <= a.start || det.start >= a.end));
    if (overlaps) return;
    state.annotations.push({ id: uid(), start: det.start, end: det.end, entityTypeId: et.id, text: text.slice(det.start, det.end) });
    entAdded++;
  });

  // Relationship detection — subject must be Company; object must be Company or Location
  const relDetections = autoDetectRelationships(text, state.annotations, state.entityTypes);
  let relAdded = 0;

  relDetections.forEach(det => {
    const rt = state.relationshipTypes.find(r => r.name === det.name);
    if (!rt) return;
    // Don't overlap with entity annotations or other rel annotations
    const overlapsEnt = state.annotations.some(a => !(det.end <= a.start || det.start >= a.end));
    const overlapsRel = state.relAnnotations.some(a => !(det.end <= a.start || det.start >= a.end));
    if (overlapsEnt || overlapsRel) return;
    state.relAnnotations.push({
      id: uid(), start: det.start, end: det.end,
      relTypeId: rt.id, text: text.slice(det.start, det.end),
      subjectId: det.subjectId || null,
      objectId:  det.objectId  || null,
    });
    relAdded++;
  });

  // Attribute detection — dates, values, percentages, durations, nationalities
  const attrDetections = autoDetectAttributes(text, state.annotations, state.relAnnotations);
  let attrAdded = 0;

  attrDetections.forEach(det => {
    const at = state.attrTypes.find(t => t.name.toUpperCase() === det.attrTypeName.toUpperCase());
    if (!at || !det.parentId) return;
    // Skip if overlaps another attribute
    const overlapsAttr = state.attrAnnotations.some(a => !(det.end <= a.start || det.start >= a.end));
    if (overlapsAttr) return;
    state.attrAnnotations.push({
      id: uid(), start: det.start, end: det.end, text: det.text,
      attrTypeId: at.id, parentId: det.parentId, parentType: det.parentType,
    });
    attrAdded++;
  });

  render();
  saveToStorage();
  DOM.docStatus.textContent = `Auto-detected ${entAdded} entit${entAdded !== 1 ? 'ies' : 'y'}, ${relAdded} relationship${relAdded !== 1 ? 's' : ''}, ${attrAdded} attribute${attrAdded !== 1 ? 's' : ''}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Attribute Auto-Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect common attribute values (dates, monetary values, percentages, durations,
 * nationalities) and link each to its nearest entity or relationship annotation.
 *
 * @param {string} text
 * @param {Array}  entityAnnotations
 * @param {Array}  relAnnotations
 * @returns {Array<{start,end,text,attrTypeName,parentId,parentType}>}
 */
function autoDetectAttributes(text, entityAnnotations, relAnnotations) {
  const results = [];

  // All potential parents with their midpoint for proximity scoring
  const allParents = [
    ...entityAnnotations.map(a => ({ id: a.id, parentType: 'entity', mid: (a.start + a.end) / 2 })),
    ...relAnnotations.map(a =>    ({ id: a.id, parentType: 'relationship', mid: (a.start + a.end) / 2 })),
  ];

  // Find the nearest parent annotation within MAX_DIST characters
  const MAX_DIST = 250;
  function nearestParent(start, end) {
    const mid = (start + end) / 2;
    let best = null, bestDist = Infinity;
    for (const p of allParents) {
      const dist = Math.abs(p.mid - mid);
      if (dist < bestDist) { bestDist = dist; best = p; }
    }
    return bestDist <= MAX_DIST ? best : null;
  }

  // Already-occupied ranges from entity/rel annotations
  const occupied = [
    ...entityAnnotations.map(a => ({ start: a.start, end: a.end })),
    ...relAnnotations.map(a =>    ({ start: a.start, end: a.end })),
  ];
  function overlapsOccupied(s, e) {
    return occupied.some(r => !(e <= r.start || s >= r.end));
  }

  function addMatches(re, attrTypeName) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const start = m.index, end = m.index + m[0].length;
      if (overlapsOccupied(start, end)) continue; // skip if inside an entity/rel span
      const parent = nearestParent(start, end);
      results.push({ start, end, text: m[0], attrTypeName, parentId: parent ? parent.id : null, parentType: parent ? parent.parentType : null });
    }
  }

  // DATE — full dates, quarters, half-years, standalone years (4 digits, 1900-2099)
  addMatches(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember))\s+\d{1,2}(?:st|nd|rd|th)?,?\s*(?:19|20)\d{2}\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-](?:\d{4}|\d{2})\b|\b(?:19|20)\d{2}[\/\-]\d{1,2}[\/\-]\d{1,2}\b|\bQ[1-4]\s+(?:19|20)\d{2}\b|\bH[12]\s+(?:19|20)\d{2}\b|\b(?:19|20)\d{2}\b/gi, 'Date');

  // VALUE — RM, USD, $ amounts with optional magnitude words
  addMatches(/\bRM\s*[\d,]+(?:\.\d+)?(?:\s*(?:million|billion|trillion|mil|bil|[MBmbt]))?\b|\$\s*[\d,]+(?:\.\d{1,2})?(?:\s*(?:million|billion|trillion|[MBT]))?\b|\b[\d,]+(?:\.\d{1,2})?\s*(?:million|billion|trillion)?\s*(?:USD|EUR|GBP|MYR|ringgit|dollars?|euros?)\b/gi, 'Value');

  // PERCENTAGE
  addMatches(/\b\d+(?:\.\d+)?\s*%|\b\d+(?:\.\d+)?\s*percent\b/gi, 'Percentage');

  // DURATION — numeric + time unit
  addMatches(/\b\d+(?:\.\d+)?\s*(?:year|month|week|day|hour)s?\b/gi, 'Duration');

  // NATIONALITY — common demonyms
  addMatches(/\b(?:Malaysian|Singaporean|Indonesian|Thai|Filipino|Vietnamese|Myanmar|Cambodian|Bruneian|American|British|Chinese|Japanese|Korean|Indian|Australian|European|Arab|Saudi|Emirati|French|German|Italian|Spanish|Canadian|Brazilian|Russian|Turkish|Egyptian)\b/g, 'Nationality');

  return results;
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
  const relMode    = !entityMode && !!state.activeRelTypeId;
  const attrMode   = !entityMode && !relMode && !!state.activeAttrTypeId;

  if (!entityMode && !relMode && !attrMode) {
    showTooltipMsg('Select an entity, relationship, or attribute type first');
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

  if (attrMode) {
    // Attributes require a selected entity or relationship as their parent
    const parentId   = state.selectedAnnotationId || state.selectedRelAnnId;
    const parentType = state.selectedAnnotationId  ? 'entity' : (state.selectedRelAnnId ? 'relationship' : null);
    if (!parentId) {
      showTooltipMsg('Select an entity or relationship card first, then highlight attribute text');
      sel.removeAllRanges();
      return;
    }
    // Attributes must not overlap with other attribute spans (can overlap entity/rel spans)
    const attrOverlap = state.attrAnnotations.some(a => !(end <= a.start || start >= a.end));
    if (attrOverlap) {
      showTooltipMsg('Cannot overlap existing attribute annotations');
      sel.removeAllRanges();
      return;
    }
    pushUndo();
    state.attrAnnotations.push({
      id: uid(), start, end, text: selectedText,
      attrTypeId: state.activeAttrTypeId,
      parentId, parentType,
    });
    sel.removeAllRanges();
    saveToStorage();
    render();
    return;
  }

  // Check overlaps with entity/rel annotations
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
      (state.selectedAnnotationId || state.selectedRelAnnId || state.selectedAttrAnnId)) {
    if (document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA') return;
    e.preventDefault();
    if (state.selectedAttrAnnId)    deleteAttrAnnotation(state.selectedAttrAnnId);
    else if (state.selectedAnnotationId) deleteAnnotation(state.selectedAnnotationId);
    else if (state.selectedRelAnnId)     deleteRelAnnotation(state.selectedRelAnnId);
    return;
  }

  if (e.key === 'Escape') {
    state.selectedAnnotationId = null;
    state.selectedRelAnnId = null;
    state.selectedAttrAnnId = null;
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
    attrTypes: state.attrTypes.map(at => ({ name: at.name, color: at.color })),
    attributes: state.attrAnnotations.map(a => {
      const at = state.attrTypes.find(t => t.id === a.attrTypeId);
      const parent = a.parentType === 'entity'
        ? state.annotations.find(e => e.id === a.parentId)
        : state.relAnnotations.find(r => r.id === a.parentId);
      return {
        text: a.text, start: a.start, end: a.end,
        label: at ? at.name : 'UNKNOWN',
        parentType: a.parentType,
        parentText: parent ? parent.text : null,
      };
    }),
  };
  downloadJSON(output, 'ner-annotations.json');
}

// ─────────────────────────────────────────────────────────────────────────────
// XLSX Export — two-sheet workbook
//   Sheet "Relationships" : one row per relationship triplet
//   Sheet "Entities"      : one row per entity annotation (attributes sheet)
// ─────────────────────────────────────────────────────────────────────────────

function handleExportXlsx() {
  if (typeof XLSX === 'undefined') {
    alert('Excel library not loaded — check your internet connection and reload the page.');
    return;
  }
  if (!state.text) {
    alert('No document to export.');
    return;
  }

  const wb = XLSX.utils.book_new();

  // ── Helper: short context snippet around a character range ─────────────────
  function ctx(start, end) {
    const PAD = 60;
    const s = Math.max(0, start - PAD);
    const e = Math.min(state.text.length, end + PAD);
    const pre  = s > 0 ? '…' : '';
    const post = e < state.text.length ? '…' : '';
    return pre + state.text.slice(s, e).replace(/\r?\n/g, ' ') + post;
  }

  // ── Helper: get attribute values for a given parent, keyed by attr type name ─
  // Returns { 'Date': 'Q1 2024; Q2 2024', 'Value': 'RM 50m', ... }
  function attrsFor(parentId, parentType) {
    const map = {};
    state.attrAnnotations
      .filter(a => a.parentId === parentId && a.parentType === parentType)
      .forEach(a => {
        const at = state.attrTypes.find(t => t.id === a.attrTypeId);
        const key = at ? at.name : '?';
        map[key] = map[key] ? map[key] + '; ' + a.text : a.text;
      });
    return map;
  }

  // Collect the ordered list of attribute type names that have any data,
  // so both sheets share the same column names.
  const relAttrTypes = new Set();
  const entAttrTypes = new Set();
  state.attrAnnotations.forEach(a => {
    const at = state.attrTypes.find(t => t.id === a.attrTypeId);
    if (!at) return;
    if (a.parentType === 'relationship') relAttrTypes.add(at.name);
    if (a.parentType === 'entity')       entAttrTypes.add(at.name);
  });
  const relAttrCols = [...relAttrTypes];
  const entAttrCols = [...entAttrTypes];

  // ── Sheet 1: Relationships ─────────────────────────────────────────────────
  // Fixed columns + one column per attribute type linked to relationships
  const relHeader = [
    'Subject', 'Subject Type',
    'Relationship Type', 'Keyword in Text',
    'Object', 'Object Type',
    'Rel Start', 'Rel End', 'Context (±60 chars)',
    ...relAttrCols,          // e.g. 'Date', 'Value', 'Percentage' …
  ];

  const relRows = state.relAnnotations.map(ra => {
    const rt     = state.relationshipTypes.find(r => r.id === ra.relTypeId);
    const subAnn = state.annotations.find(a => a.id === ra.subjectId);
    const objAnn = state.annotations.find(a => a.id === ra.objectId);
    const subEt  = subAnn ? state.entityTypes.find(e => e.id === subAnn.entityTypeId) : null;
    const objEt  = objAnn ? state.entityTypes.find(e => e.id === objAnn.entityTypeId) : null;
    const atMap  = attrsFor(ra.id, 'relationship');

    return [
      subAnn ? subAnn.text : '',
      subEt  ? subEt.name  : '',
      rt     ? rt.name     : '',
      ra.text,
      objAnn ? objAnn.text : '',
      objEt  ? objEt.name  : '',
      ra.start,
      ra.end,
      ctx(ra.start, ra.end),
      ...relAttrCols.map(col => atMap[col] || ''),
    ];
  });

  const wsRel = XLSX.utils.aoa_to_sheet([relHeader, ...relRows]);
  wsRel['!cols'] = [
    { wch: 32 }, // Subject
    { wch: 14 }, // Subject Type
    { wch: 22 }, // Relationship Type
    { wch: 22 }, // Keyword in Text
    { wch: 32 }, // Object
    { wch: 14 }, // Object Type
    { wch: 10 }, // Rel Start
    { wch: 10 }, // Rel End
    { wch: 70 }, // Context
    ...relAttrCols.map(() => ({ wch: 24 })),
  ];
  XLSX.utils.book_append_sheet(wb, wsRel, 'Relationships');

  // ── Sheet 2: Entities ──────────────────────────────────────────────────────
  // Fixed columns + one column per attribute type linked to entities
  const entHeader = [
    '#', 'Entity Text', 'Entity Type',
    'Start', 'End',
    'Role in Relationships',
    'Context (±60 chars)',
    ...entAttrCols,          // e.g. 'Location', 'Nationality' …
  ];

  const entRows = state.annotations.map((a, i) => {
    const et = state.entityTypes.find(e => e.id === a.entityTypeId);

    const roles = [];
    state.relAnnotations.forEach(ra => {
      const rt = state.relationshipTypes.find(r => r.id === ra.relTypeId);
      const relName = rt ? rt.name : '?';
      if (ra.subjectId === a.id) {
        const obj = state.annotations.find(x => x.id === ra.objectId);
        roles.push(`Subject of "${relName}" → ${obj ? obj.text : '?'}`);
      } else if (ra.objectId === a.id) {
        const sub = state.annotations.find(x => x.id === ra.subjectId);
        roles.push(`Object of "${relName}" ← ${sub ? sub.text : '?'}`);
      }
    });

    const atMap = attrsFor(a.id, 'entity');

    return [
      i + 1,
      a.text,
      et ? et.name : '',
      a.start,
      a.end,
      roles.join('; ') || '—',
      ctx(a.start, a.end),
      ...entAttrCols.map(col => atMap[col] || ''),
    ];
  });

  const wsEnt = XLSX.utils.aoa_to_sheet([entHeader, ...entRows]);
  wsEnt['!cols'] = [
    { wch: 5  }, // #
    { wch: 32 }, // Entity Text
    { wch: 14 }, // Entity Type
    { wch: 8  }, // Start
    { wch: 8  }, // End
    { wch: 50 }, // Role in Relationships
    { wch: 70 }, // Context
    ...entAttrCols.map(() => ({ wch: 24 })),
  ];
  XLSX.utils.book_append_sheet(wb, wsEnt, 'Entities');

  XLSX.writeFile(wb, 'ner-annotations.xlsx');
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

  // Merge attribute types
  const attrMap = {};
  state.attrTypes.forEach(at => { attrMap[at.name] = at; });

  (data.attrTypes || []).forEach(at => {
    if (!attrMap[at.name]) {
      const newAt = { id: uid(), name: at.name, color: at.color || randomColor() };
      state.attrTypes.push(newAt);
      attrMap[at.name] = newAt;
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

  // Re-link attributes by matching parent text (best-effort)
  state.attrAnnotations = (data.attributes || []).map(a => {
    const at = attrMap[a.label];
    if (!at) return null;
    let parentId = null, parentType = null;
    if (a.parentType === 'entity' && a.parentText) {
      const match = state.annotations.find(e => e.text === a.parentText);
      if (match) { parentId = match.id; parentType = 'entity'; }
    } else if (a.parentType === 'relationship' && a.parentText) {
      const match = state.relAnnotations.find(r => r.text === a.parentText);
      if (match) { parentId = match.id; parentType = 'relationship'; }
    }
    return {
      id: uid(), start: a.start, end: a.end,
      text: a.text || data.text.slice(a.start, a.end),
      attrTypeId: at.id, parentId, parentType,
    };
  }).filter(Boolean);

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
  renderAttrTypes();
  renderModeSwitch();
  if (state.mode === 'labeling') {
    renderTextDisplay();
    renderActiveEntityBadge();
  }
  renderAnnotationsList();
  updateDocStatus();
  saveToStorage();
  // Draw relationship arcs after layout is committed
  requestAnimationFrame(renderRelationshipArcs);
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

function renderAttrTypes() {
  DOM.attrTypesList.innerHTML = '';
  state.attrTypes.forEach(at => {
    const item = document.createElement('div');
    item.className = 'entity-type-item' + (at.id === state.activeAttrTypeId ? ' active' : '');
    item.dataset.id = at.id;

    const swatch = document.createElement('span');
    swatch.className = 'attr-swatch';
    swatch.style.color = at.color;
    swatch.textContent = '\u25c6'; // ◆ diamond

    const name = document.createElement('span');
    name.className = 'entity-name';
    name.textContent = at.name;

    const count = state.attrAnnotations.filter(a => a.attrTypeId === at.id).length;
    const countBadge = document.createElement('span');
    countBadge.className = 'entity-count-badge';
    countBadge.textContent = count;

    const delBtn = document.createElement('button');
    delBtn.className = 'entity-delete-btn';
    delBtn.title = 'Remove attribute type';
    delBtn.textContent = '\u00d7';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      deleteAttrType(at.id);
    });

    item.appendChild(swatch);
    item.appendChild(name);
    item.appendChild(countBadge);
    item.appendChild(delBtn);

    item.addEventListener('click', () => {
      if (state.activeAttrTypeId === at.id) {
        state.activeAttrTypeId = null;
      } else {
        state.activeAttrTypeId = at.id;
        state.activeEntityTypeId = null; // mutual exclusion
        state.activeRelTypeId    = null;
      }
      render();
    });

    DOM.attrTypesList.appendChild(item);
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
  const at = !et && !rt && state.attrTypes.find(a => a.id === state.activeAttrTypeId);

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
  } else if (at) {
    // Show which parent (entity or relationship) the attribute will attach to
    const parentAnn = state.selectedAnnotationId
      ? state.annotations.find(a => a.id === state.selectedAnnotationId)
      : state.selectedRelAnnId
        ? state.relAnnotations.find(r => r.id === state.selectedRelAnnId)
        : null;
    const parentLabel = parentAnn ? ` → "${parentAnn.text}"` : ' (select a parent first)';
    DOM.activeEntityLabel.textContent = 'Active Attribute:';
    DOM.activeEntityBadge.textContent = at.name + parentLabel;
    DOM.activeEntityBadge.style.background = hexToRgba(at.color, 0.2);
    DOM.activeEntityBadge.style.color = at.color;
    DOM.activeEntityBadge.style.borderColor = at.color;
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

  // Merge entity, relationship and attribute annotations.
  // Attributes that overlap entity/rel spans are skipped from inline rendering
  // (they still appear in the annotations panel).
  const occupiedRanges = [
    ...state.annotations.map(a => ({ start: a.start, end: a.end })),
    ...state.relAnnotations.map(a => ({ start: a.start, end: a.end })),
  ];
  const visibleAttrs = state.attrAnnotations.filter(a =>
    !occupiedRanges.some(r => !(a.end <= r.start || a.start >= r.end))
  );
  const allItems = [
    ...state.annotations.map(a => ({ ...a, isRel: false, isAttr: false })),
    ...state.relAnnotations.map(a => ({ ...a, isRel: true, isAttr: false })),
    ...visibleAttrs.map(a => ({ ...a, isRel: false, isAttr: true })),
  ].sort((a, b) => a.start - b.start || a.end - b.end);

  let html = '';
  let cursor = 0;

  for (const item of allItems) {
    if (item.start < cursor) continue; // skip overlapping

    if (item.start > cursor) {
      html += escapeHtml(text.slice(cursor, item.start));
    }

    if (item.isAttr) {
      const at = state.attrTypes.find(a => a.id === item.attrTypeId);
      const color = at ? at.color : '#888';
      const isSelected = item.id === state.selectedAttrAnnId;
      const selectedClass = isSelected ? ' selected' : '';
      html += `<span class="ner-attr-span${selectedClass}" data-attr-id="${item.id}" style="border-bottom:2px dotted ${color}; color:${color};" title="${escapeAttr('\u25c6 ' + (at ? at.name : 'ATTR'))}">`;
      html += escapeHtml(text.slice(item.start, item.end));
      html += `<span class="ner-label-tag ner-attr-tag" style="background:${color}; color:${contrastColor(color)};">\u25c6${escapeHtml(at ? at.name : '?')}</span>`;
      html += '</span>';
    } else if (item.isRel) {
      const rt = state.relationshipTypes.find(r => r.id === item.relTypeId);
      const color = rt ? rt.color : '#888';
      const isSelected = item.id === state.selectedRelAnnId;
      const selectedClass = isSelected ? ' selected' : '';
      // Relationship keywords are already shown as arcs above the text.
      // Render inline as plain text with only a subtle underline so the text
      // stays readable. A dashed underline + faint background appear on select.
      const inlineStyle = isSelected
        ? `border-bottom:2px dashed ${color}; background:${hexToRgba(color, 0.1)};`
        : `border-bottom:1px dotted ${hexToRgba(color, 0.45)};`;
      html += `<span class="ner-rel-span${selectedClass}" data-rel-id="${item.id}" style="${inlineStyle}" title="${escapeAttr(rt ? rt.name : 'UNKNOWN')}">`;
      html += escapeHtml(text.slice(item.start, item.end));
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

  // Attach events to attribute spans
  DOM.textDisplay.querySelectorAll('.ner-attr-span').forEach(span => {
    const attrId = span.dataset.attrId;
    span.addEventListener('click', e => {
      e.stopPropagation();
      state.selectedAttrAnnId     = (state.selectedAttrAnnId === attrId) ? null : attrId;
      state.selectedAnnotationId  = null;
      state.selectedRelAnnId      = null;
      render();
      if (state.selectedAttrAnnId) {
        const card = DOM.annotationsList.querySelector(`[data-attr-id="${attrId}"]`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
    span.addEventListener('mouseenter', e => {
      const ann = state.attrAnnotations.find(a => a.id === attrId);
      const at  = ann && state.attrTypes.find(t => t.id === ann.attrTypeId);
      if (!at) return;
      const parent = ann.parentType === 'entity'
        ? state.annotations.find(a => a.id === ann.parentId)
        : state.relAnnotations.find(a => a.id === ann.parentId);
      const parentLabel = parent ? ` of "${parent.text}"` : '';
      showTooltip(e, `\u25c6 ${at.name}${parentLabel}  [${ann.start}\u2013${ann.end}]`);
    });
    span.addEventListener('mouseleave', hideTooltip);
  });

  // Attach events to entity spans
  DOM.textDisplay.querySelectorAll('.ner-span').forEach(span => {
    const annId = span.dataset.annId;
    span.addEventListener('click', e => {
      e.stopPropagation();
      state.selectedAnnotationId = (state.selectedAnnotationId === annId) ? null : annId;
      state.selectedRelAnnId = null;
      state.selectedAttrAnnId = null;
      render();
      if (state.selectedAnnotationId) {
        const card = DOM.annotationsList.querySelector(`[data-ann-id="${annId}"]`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
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
      state.selectedAttrAnnId = null;
      render();
      if (state.selectedRelAnnId) {
        const card = DOM.annotationsList.querySelector(`[data-rel-id="${relId}"]`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
    span.addEventListener('mouseenter', e => {
      const ann = state.relAnnotations.find(a => a.id === relId);
      const rt  = ann && state.relationshipTypes.find(t => t.id === ann.relTypeId);
      if (!rt) return;
      showTooltip(e, `REL: ${rt.name}  [${ann.start}\u2013${ann.end}]`);
      if (ann) highlightLinkedEntities(ann.subjectId, ann.objectId, rt.color);
    });
    span.addEventListener('mouseleave', () => {
      hideTooltip();
      // Only clear highlights if this rel is not selected
      const ann = state.relAnnotations.find(a => a.id === relId);
      if (!ann || state.selectedRelAnnId !== relId) clearLinkedHighlights();
    });
  });

  // If a relationship is currently selected, keep its entities highlighted
  if (state.selectedRelAnnId) {
    const selRel = state.relAnnotations.find(a => a.id === state.selectedRelAnnId);
    const selRt  = selRel && state.relationshipTypes.find(t => t.id === selRel.relTypeId);
    if (selRel && selRt) highlightLinkedEntities(selRel.subjectId, selRel.objectId, selRt.color);
  }

  // If an attribute is currently selected, highlight its parent entity/rel span
  if (state.selectedAttrAnnId) {
    const selAttr = state.attrAnnotations.find(a => a.id === state.selectedAttrAnnId);
    if (selAttr && selAttr.parentId) {
      const at = state.attrTypes.find(t => t.id === selAttr.attrTypeId);
      const atColor = at ? at.color : '#888';
      if (selAttr.parentType === 'entity') {
        const parentEl = DOM.textDisplay.querySelector(`[data-ann-id="${selAttr.parentId}"]`);
        if (parentEl) {
          parentEl.classList.add('attr-linked-parent');
          parentEl.style.setProperty('--attr-link-color', atColor);
        }
      } else if (selAttr.parentType === 'relationship') {
        const parentEl = DOM.textDisplay.querySelector(`[data-rel-id="${selAttr.parentId}"]`);
        if (parentEl) {
          parentEl.classList.add('attr-linked-parent');
          parentEl.style.setProperty('--attr-link-color', atColor);
        }
      }
    }
  }

  // Clicking background deselects
  DOM.textDisplay.addEventListener('click', e => {
    if (e.target === DOM.textDisplay) {
      state.selectedAnnotationId = null;
      state.selectedRelAnnId = null;
      state.selectedAttrAnnId = null;
      clearLinkedHighlights();
      renderTextDisplay();
    }
  }, { once: true });
}

/** Highlight the subject and object entity spans of a relationship. */
function highlightLinkedEntities(subjectId, objectId, color) {
  clearLinkedHighlights();
  const applyClass = (annId, cls) => {
    if (!annId) return;
    const el = DOM.textDisplay.querySelector(`[data-ann-id="${annId}"]`);
    if (!el) return;
    el.classList.add(cls);
    el.style.setProperty('--link-color', color);
  };
  applyClass(subjectId, 'linked-subject');
  applyClass(objectId,  'linked-object');
}

function clearLinkedHighlights() {
  DOM.textDisplay.querySelectorAll('.linked-subject, .linked-object').forEach(el => {
    el.classList.remove('linked-subject', 'linked-object');
    el.style.removeProperty('--link-color');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Relationship Arc Visualization — fixed SVG overlay
// Draws a bracket-shaped arc above each Entity1 ●──[REL]──▶ Entity2 triplet
// ─────────────────────────────────────────────────────────────────────────────

function getOrCreateArcSvg() {
  const NS = 'http://www.w3.org/2000/svg';
  let svg = document.getElementById('rel-arc-svg');
  if (!svg) {
    svg = document.createElementNS(NS, 'svg');
    svg.id = 'rel-arc-svg';
    // Fixed so it renders over the text in viewport coords; pointer-events: none
    // so all text interactions still work beneath it.
    svg.setAttribute('style', [
      'position:fixed', 'top:0', 'left:0',
      'width:100vw', 'height:100vh',
      'pointer-events:none', 'z-index:6',
      'overflow:visible',
    ].join(';'));
    document.body.appendChild(svg);
    // On scroll: just redraw arcs at new positions — never adjust padding,
    // because changing paddingTop itself fires a scroll event which would loop.
    DOM.textDisplay.addEventListener('scroll', () => requestAnimationFrame(() => renderRelationshipArcs(false)));
    window.addEventListener('resize',          () => requestAnimationFrame(renderRelationshipArcs));
  }
  return svg;
}

/**
 * Draws bracket-style arcs for every relationship annotation that has both a
 * subject and an object entity.  Uses viewport coordinates from
 * getBoundingClientRect so the arcs stay aligned with the text even after
 * partial scrolls.  Called via requestAnimationFrame after every render() so
 * layout is fully committed before we measure.
 */
/**
 * @param {boolean} adjustPadding  When true (default), sets paddingTop on the
 *   text container once to reserve space for arcs, then schedules a second
 *   pass with adjustPadding=false to draw at the new positions.
 *   Scroll events call with false to avoid the paddingTop→scroll→loop.
 */
function renderRelationshipArcs(adjustPadding = true) {
  const NS  = 'http://www.w3.org/2000/svg';
  const svg = getOrCreateArcSvg();

  // Clear previous arcs
  [...svg.childNodes].forEach(n => n.remove());

  if (state.mode !== 'labeling' || !state.relAnnotations.length) {
    if (adjustPadding) DOM.textDisplay.style.paddingTop = '';  // restore CSS default
    return;
  }

  const cRect = DOM.textDisplay.getBoundingClientRect();
  const arcs  = [];

  for (const relAnn of state.relAnnotations) {
    if (!relAnn.subjectId || !relAnn.objectId) continue;
    const rt    = state.relationshipTypes.find(r => r.id === relAnn.relTypeId);
    const subEl = DOM.textDisplay.querySelector(`[data-ann-id="${relAnn.subjectId}"]`);
    const objEl = DOM.textDisplay.querySelector(`[data-ann-id="${relAnn.objectId}"]`);
    if (!rt || !subEl || !objEl) continue;

    const sr = subEl.getBoundingClientRect();
    const or = objEl.getBoundingClientRect();

    // Skip entities that are fully outside the visible scroll area
    if (sr.bottom < cRect.top || sr.top > cRect.bottom) continue;
    if (or.bottom < cRect.top || or.top  > cRect.bottom) continue;

    arcs.push({
      id:       relAnn.id,
      color:    rt.color,
      label:    rt.name,
      subX:     sr.left + sr.width  / 2,
      subY:     Math.max(sr.top,  cRect.top),
      objX:     or.left + or.width  / 2,
      objY:     Math.max(or.top,  cRect.top),
      selected: relAnn.id === state.selectedRelAnnId,
      isAttr:   false,
    });
  }

  // Attribute arcs — dotted lines connecting each attribute span to its parent entity
  for (const attrAnn of state.attrAnnotations) {
    if (attrAnn.parentType !== 'entity' || !attrAnn.parentId) continue;
    const at     = state.attrTypes.find(t => t.id === attrAnn.attrTypeId);
    const attrEl = DOM.textDisplay.querySelector(`[data-attr-id="${attrAnn.id}"]`);
    const parEl  = DOM.textDisplay.querySelector(`[data-ann-id="${attrAnn.parentId}"]`);
    if (!at || !attrEl || !parEl) continue;

    const ar = attrEl.getBoundingClientRect();
    const pr = parEl.getBoundingClientRect();
    if (ar.bottom < cRect.top || ar.top > cRect.bottom) continue;
    if (pr.bottom < cRect.top || pr.top > cRect.bottom) continue;

    arcs.push({
      id:       attrAnn.id,
      color:    at.color,
      label:    at.name,
      subX:     ar.left + ar.width  / 2,
      subY:     Math.max(ar.top,  cRect.top),
      objX:     pr.left + pr.width  / 2,
      objY:     Math.max(pr.top,  cRect.top),
      selected: attrAnn.id === state.selectedAttrAnnId,
      isAttr:   true,
    });
  }

  // ── Layout constants ──────────────────────────────────────────────────────
  // Arcs are drawn entirely in the padding-top zone as floating bars so their
  // lines never cross through the text content below.
  const LEVEL_H  = 28;   // px between arc levels (apex-to-apex)
  const HOOK     = 7;    // downward tick length at each end of the horizontal bar
  const TOP_MARG = 10;   // px from container top to the first (level-0) arc apex

  // ── Level assignment ──────────────────────────────────────────────────────
  // Sort by horizontal span so shorter arcs sit at lower (text-adjacent) levels.
  // Collision uses the union of the entity X extents AND the badge footprint so
  // badges at the same level can never overlap each other.
  const BADGE_HW = 13;   // half badge-width + margin used for collision
  arcs.sort((a, b) => Math.abs(a.objX - a.subX) - Math.abs(b.objX - b.subX));

  const slots = [];
  arcs.forEach(arc => {
    const midX = (arc.subX + arc.objX) / 2;
    arc.midX   = midX;
    const lo = Math.min(arc.subX, arc.objX, midX - BADGE_HW) - 2;
    const hi = Math.max(arc.subX, arc.objX, midX + BADGE_HW) + 2;
    let lvl = 0;
    for (; lvl < 20; lvl++) {
      if (!slots[lvl] || !slots[lvl].some(([l, r]) => lo < r && hi > l)) break;
    }
    (slots[lvl] = slots[lvl] || []).push([lo, hi]);
    arc.level = lvl;
  });

  // ── Dynamic padding-top ───────────────────────────────────────────────────
  // Reserve exactly enough space above the text for all arc levels.
  // Formula: top-margin + one slot per level + hook height + gap before text.
  const maxLevel = arcs.length ? Math.max(...arcs.map(a => a.level)) : -1;
  const BASE_PAD  = 20;
  // Space needed = top-margin + apex of last level + hook + gap before text
  const neededPad = maxLevel >= 0
    ? TOP_MARG + maxLevel * LEVEL_H + HOOK + 4
    : BASE_PAD;
  const currentPad = parseFloat(DOM.textDisplay.style.paddingTop || BASE_PAD);

  if (adjustPadding && Math.abs(currentPad - neededPad) > 2) {
    DOM.textDisplay.style.paddingTop = neededPad + 'px';
    requestAnimationFrame(() => renderRelationshipArcs(false));
    return;
  }

  // ── Apex positions — level 0 closest to text, maxLevel farthest ──────────
  // Ordering is inverted so shorter arcs (level 0) sit nearest to the entities
  // they annotate, matching brat / CoNLL visual convention.
  // apexY is purely container-relative — no entity Y involved — so the bar
  // never descends into the text area regardless of which line the entity is on.
  arcs.forEach(arc => {
    arc.apexY = cRect.top + TOP_MARG + (maxLevel - arc.level) * LEVEL_H;
  });

  if (!arcs.length) return;

  // Draw unselected first so selected arcs render on top
  [...arcs.filter(a => !a.selected), ...arcs.filter(a => a.selected)]
    .forEach(arc => _drawArc(svg, NS, arc));
}

/**
 * 3-character abbreviation used on compact arc badges.
 * Takes the first word of the label (stripping punctuation) and returns its
 * first 3 uppercase letters, so "Acquires" → "ACQ", "Partners With" → "PAR".
 */
function _arcAbbrev(label) {
  return label.replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/)[0].slice(0, 3).toUpperCase();
}

/**
 * Draws one bracket arc into svg.
 *
 * Unselected arcs use a compact colour-coded pill badge (3-char abbreviation)
 * at the arc apex so many arcs can coexist without visual clutter.
 * The selected arc shows the full label box so the user always has context.
 * A native SVG <title> provides a hover tooltip with the full label.
 */
function _drawArc(svg, NS, arc) {
  const { subX, subY, objX, objY, apexY, color, label, selected, isAttr } = arc;
  const midX = arc.midX ?? (subX + objX) / 2;

  // Unselected arcs are thinner and more transparent to stay in the background
  const SW    = isAttr ? (selected ? 1.8 : 1.0) : (selected ? 2.5 : 1.2);
  const alpha = isAttr ? (selected ? 0.9 : 0.4) : (selected ? 1.0 : 0.5);

  const g = document.createElementNS(NS, 'g');

  // Native browser tooltip — shows full label on hover at no interaction cost
  const title = document.createElementNS(NS, 'title');
  title.textContent = label;
  g.appendChild(title);

  // ── Floating-bar path ────────────────────────────────────────────────────
  // The bar is drawn entirely in the padding-top zone.  Small downward hooks
  // at each end act as visual anchors; they never reach entity Y positions so
  // no lines cross through the text content.
  const HOOK = 7;
  const lx   = Math.min(subX, objX);
  const rx   = Math.max(subX, objX);
  const R    = Math.min(4, (rx - lx) / 2);   // corner radius

  let d;
  if (rx - lx < 2) {
    // Degenerate case: subject and object at the same X — draw a tiny bump
    d = `M ${lx} ${apexY + HOOK} Q ${midX - 8} ${apexY} ${rx} ${apexY + HOOK}`;
  } else {
    d = [
      `M ${lx} ${apexY + HOOK}`,
      `L ${lx} ${apexY + R}`,
      `Q ${lx} ${apexY} ${lx + R} ${apexY}`,
      `L ${rx - R} ${apexY}`,
      `Q ${rx} ${apexY} ${rx} ${apexY + R}`,
      `L ${rx} ${apexY + HOOK}`,
    ].join(' ');
  }

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', String(SW));
  path.setAttribute('stroke-opacity', String(alpha));
  if (isAttr) path.setAttribute('stroke-dasharray', '4 3');
  g.appendChild(path);

  // ── Thin dashed connectors: hook-end → entity ────────────────────────────
  // Very low opacity + wide-gap dash so they read as a subtle visual guide,
  // not a dominant element — they show which entity each arc end belongs to
  // without the thick opaque stems that used to cross through text lines.
  const connOpacity = selected ? 0.38 : 0.2;
  [[subX, subY], [objX, objY]].forEach(([ex, ey]) => {
    const cn = document.createElementNS(NS, 'line');
    cn.setAttribute('x1', String(ex));
    cn.setAttribute('y1', String(apexY + HOOK));
    cn.setAttribute('x2', String(ex));
    cn.setAttribute('y2', String(ey));
    cn.setAttribute('stroke', color);
    cn.setAttribute('stroke-width', '0.8');
    cn.setAttribute('stroke-opacity', String(connOpacity));
    cn.setAttribute('stroke-dasharray', '3 6');
    g.appendChild(cn);
  });

  // ── Subject — filled dot ────────────────────────────────────────────────
  const dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('cx', String(subX));
  dot.setAttribute('cy', String(subY));
  dot.setAttribute('r', selected ? '3.5' : '2.5');
  dot.setAttribute('fill', color);
  dot.setAttribute('opacity', String(alpha));
  g.appendChild(dot);

  // ── Object — downward arrowhead ─────────────────────────────────────────
  const AS = selected ? 4.5 : 3;
  const tri = document.createElementNS(NS, 'polygon');
  tri.setAttribute('points',
    `${objX},${objY} ${objX - AS},${objY - AS * 1.7} ${objX + AS},${objY - AS * 1.7}`);
  tri.setAttribute('fill', color);
  tri.setAttribute('opacity', String(alpha));
  g.appendChild(tri);

  // ── Label: full box for selected arc, compact pill badge for all others ──
  if (selected) {
    // Full label box — identical to the original design so the user has clear
    // context on whichever arc they clicked.
    const FONT = 10;
    const PX   = 6;
    const PY   = 3;
    const LW   = Math.max(label.length * 6.3 + PX * 2, 36);
    const LH   = FONT + PY * 2;
    const bx   = midX - LW / 2;
    const by   = apexY - LH / 2;

    // White halo ring so the selected label pops above other badges
    const halo = document.createElementNS(NS, 'rect');
    halo.setAttribute('x', String(bx - 2));
    halo.setAttribute('y', String(by - 2));
    halo.setAttribute('width',  String(LW + 4));
    halo.setAttribute('height', String(LH + 4));
    halo.setAttribute('rx', '4');
    halo.setAttribute('fill', 'none');
    halo.setAttribute('stroke', '#fff');
    halo.setAttribute('stroke-width', '2');
    g.appendChild(halo);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(bx));
    rect.setAttribute('y', String(by));
    rect.setAttribute('width',  String(LW));
    rect.setAttribute('height', String(LH));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', color);
    g.appendChild(rect);

    const txt = document.createElementNS(NS, 'text');
    txt.setAttribute('x', String(midX));
    txt.setAttribute('y', String(by + PY + FONT - 1));
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('font-size',   `${FONT}px`);
    txt.setAttribute('font-family',
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    txt.setAttribute('font-weight', '700');
    txt.setAttribute('fill', contrastColor(color));
    txt.setAttribute('pointer-events', 'none');
    txt.textContent = label;
    g.appendChild(txt);

  } else {
    // Compact pill badge: 3-char abbreviation in a small rounded rect.
    // Much smaller than the full label box so dozens of arcs can coexist
    // without crowding — full label is always available via hover tooltip.
    const BW   = 22;   // badge width  (px)
    const BH   = 12;   // badge height (px)
    const BFNT = 7.5;  // badge font size (px)

    const badge = document.createElementNS(NS, 'rect');
    badge.setAttribute('x', String(midX - BW / 2));
    badge.setAttribute('y', String(apexY - BH / 2));
    badge.setAttribute('width',  String(BW));
    badge.setAttribute('height', String(BH));
    badge.setAttribute('rx', '5');
    badge.setAttribute('fill', color);
    badge.setAttribute('opacity', '0.82');
    g.appendChild(badge);

    const btxt = document.createElementNS(NS, 'text');
    btxt.setAttribute('x', String(midX));
    // SVG text y is the baseline; centre it inside the badge
    btxt.setAttribute('y', String(apexY + BFNT / 2 - 1));
    btxt.setAttribute('text-anchor', 'middle');
    btxt.setAttribute('font-size',   `${BFNT}px`);
    btxt.setAttribute('font-family',
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    btxt.setAttribute('font-weight', '700');
    btxt.setAttribute('fill', contrastColor(color));
    btxt.setAttribute('pointer-events', 'none');
    btxt.textContent = _arcAbbrev(label);
    g.appendChild(btxt);
  }

  svg.appendChild(g);
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

      // Resolve subject and object entity annotations
      const subjectAnn = ann.subjectId ? state.annotations.find(a => a.id === ann.subjectId) : null;
      const objectAnn  = ann.objectId  ? state.annotations.find(a => a.id === ann.objectId)  : null;
      const subjectEt  = subjectAnn ? state.entityTypes.find(e => e.id === subjectAnn.entityTypeId) : null;
      const objectEt   = objectAnn  ? state.entityTypes.find(e => e.id === objectAnn.entityTypeId)  : null;

      const item = document.createElement('div');
      item.className = 'annotation-item rel-item' + (isSelected ? ' selected' : '');
      item.dataset.relId = ann.id;

      // Striped color bar on left
      const colorBar = document.createElement('div');
      colorBar.className = 'annotation-color-bar';
      colorBar.style.background = `repeating-linear-gradient(45deg, ${color}, ${color} 2px, transparent 2px, transparent 5px)`;

      // Triplet body
      const info = document.createElement('div');
      info.className = 'annotation-info rel-triplet';

      // ── Subject row ──
      const subjectRow = document.createElement('div');
      subjectRow.className = 'triplet-entity triplet-subject';
      if (isSelected) {
        const subSel = document.createElement('select');
        subSel.className = 'ann-edit-select';
        subSel.title = 'Change subject entity (Company only)';
        const noneOptS = document.createElement('option');
        noneOptS.value = '';
        noneOptS.textContent = '— none —';
        if (!ann.subjectId) noneOptS.selected = true;
        subSel.appendChild(noneOptS);
        state.annotations.forEach(a => {
          const aEt = state.entityTypes.find(e => e.id === a.entityTypeId);
          if (!aEt || aEt.name.toUpperCase() !== 'COMPANY') return;
          const opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = `${a.text} (${aEt.name})`;
          if (a.id === ann.subjectId) opt.selected = true;
          subSel.appendChild(opt);
        });
        subSel.addEventListener('click', e => e.stopPropagation());
        subSel.addEventListener('change', e => {
          e.stopPropagation();
          pushUndo();
          const target = state.relAnnotations.find(r => r.id === ann.id);
          if (target) target.subjectId = e.target.value || null;
          render();
        });
        subjectRow.appendChild(subSel);
      } else if (subjectAnn && subjectEt) {
        const dot = document.createElement('span');
        dot.className = 'triplet-dot';
        dot.style.background = subjectEt.color;
        const lbl = document.createElement('span');
        lbl.className = 'triplet-entity-text';
        lbl.title = subjectAnn.text;
        lbl.textContent = subjectAnn.text;
        subjectRow.appendChild(dot);
        subjectRow.appendChild(lbl);
      } else {
        subjectRow.textContent = '—';
        subjectRow.style.color = 'var(--text-muted)';
      }

      // ── Relationship arrow ──
      const relRow = document.createElement('div');
      relRow.className = 'triplet-rel';
      relRow.style.color = color;
      const relArrow = document.createElement('span');
      relArrow.className = 'triplet-arrow';
      relArrow.textContent = '\u2193';
      relRow.appendChild(relArrow);
      if (isSelected) {
        const relTypeSel = document.createElement('select');
        relTypeSel.className = 'ann-edit-select';
        relTypeSel.title = 'Change relationship type';
        state.relationshipTypes.forEach(rt2 => {
          const opt = document.createElement('option');
          opt.value = rt2.id;
          opt.textContent = rt2.name;
          if (rt2.id === ann.relTypeId) opt.selected = true;
          relTypeSel.appendChild(opt);
        });
        relTypeSel.addEventListener('click', e => e.stopPropagation());
        relTypeSel.addEventListener('change', e => {
          e.stopPropagation();
          pushUndo();
          const target = state.relAnnotations.find(r => r.id === ann.id);
          if (target) target.relTypeId = e.target.value;
          render();
        });
        relRow.appendChild(relTypeSel);
      } else {
        const relLbl = document.createElement('span');
        relLbl.className = 'triplet-rel-name';
        relLbl.textContent = (rt ? rt.name : 'UNKNOWN') + ' \u2933';
        relRow.appendChild(relLbl);
      }

      // Keyword + position
      const kwRow = document.createElement('div');
      kwRow.className = 'annotation-meta';
      kwRow.textContent = `"${ann.text}"  \u00b7  ${ann.start}\u2013${ann.end}`;

      // ── Object row ──
      const objectRow = document.createElement('div');
      objectRow.className = 'triplet-entity triplet-object';
      if (isSelected) {
        const objSel = document.createElement('select');
        objSel.className = 'ann-edit-select';
        objSel.title = 'Change object entity (Company or Location)';
        const noneOptO = document.createElement('option');
        noneOptO.value = '';
        noneOptO.textContent = '— none —';
        if (!ann.objectId) noneOptO.selected = true;
        objSel.appendChild(noneOptO);
        state.annotations.forEach(a => {
          const aEt = state.entityTypes.find(e => e.id === a.entityTypeId);
          if (!aEt || !['COMPANY', 'LOCATION'].includes(aEt.name.toUpperCase())) return;
          const opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = `${a.text} (${aEt.name})`;
          if (a.id === ann.objectId) opt.selected = true;
          objSel.appendChild(opt);
        });
        objSel.addEventListener('click', e => e.stopPropagation());
        objSel.addEventListener('change', e => {
          e.stopPropagation();
          pushUndo();
          const target = state.relAnnotations.find(r => r.id === ann.id);
          if (target) target.objectId = e.target.value || null;
          render();
        });
        objectRow.appendChild(objSel);
      } else if (objectAnn && objectEt) {
        const dot = document.createElement('span');
        dot.className = 'triplet-dot';
        dot.style.background = objectEt.color;
        const lbl = document.createElement('span');
        lbl.className = 'triplet-entity-text';
        lbl.title = objectAnn.text;
        lbl.textContent = objectAnn.text;
        objectRow.appendChild(dot);
        objectRow.appendChild(lbl);
      } else {
        objectRow.textContent = '—';
        objectRow.style.color = 'var(--text-muted)';
      }

      info.appendChild(subjectRow);
      info.appendChild(relRow);
      info.appendChild(objectRow);
      info.appendChild(kwRow);

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
        state.selectedAttrAnnId = null;
        render();
        if (state.mode === 'labeling') {
          const span = DOM.textDisplay.querySelector(`[data-rel-id="${ann.id}"]`);
          if (span) span.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });

      DOM.annotationsList.appendChild(item);
      // Render any attributes attached to this relationship
      appendAttrSubItems(ann.id, 'relationship');
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
      if (isSelected) {
        const typeSel = document.createElement('select');
        typeSel.className = 'ann-edit-select';
        typeSel.title = 'Change entity type';
        state.entityTypes.forEach(et2 => {
          const opt = document.createElement('option');
          opt.value = et2.id;
          opt.textContent = et2.name;
          if (et2.id === ann.entityTypeId) opt.selected = true;
          typeSel.appendChild(opt);
        });
        typeSel.addEventListener('click', e => e.stopPropagation());
        typeSel.addEventListener('change', e => {
          e.stopPropagation();
          pushUndo();
          const target = state.annotations.find(a => a.id === ann.id);
          if (target) target.entityTypeId = e.target.value;
          render();
        });
        meta.appendChild(typeSel);
        const posSpan = document.createElement('span');
        posSpan.textContent = `  \u00b7  ${ann.start}\u2013${ann.end}`;
        meta.appendChild(posSpan);
      } else {
        meta.textContent = `${et ? et.name : 'UNKNOWN'}  \u00b7  ${ann.start}\u2013${ann.end}`;
      }

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
        state.selectedAttrAnnId = null;
        render();
        if (state.mode === 'labeling') {
          const span = DOM.textDisplay.querySelector(`[data-ann-id="${ann.id}"]`);
          if (span) span.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });

      DOM.annotationsList.appendChild(item);

      // Render any attributes attached to this entity
      appendAttrSubItems(ann.id, 'entity');
    }
  });
}

/** Render attribute sub-items nested under a parent annotation card. */
function appendAttrSubItems(parentId, parentType) {
  const attrs = state.attrAnnotations.filter(a => a.parentId === parentId && a.parentType === parentType);
  attrs.forEach(attr => {
    const at = state.attrTypes.find(t => t.id === attr.attrTypeId);
    const color = at ? at.color : '#888';
    const isSelected = attr.id === state.selectedAttrAnnId;

    const sub = document.createElement('div');
    sub.className = 'attr-sub-item' + (isSelected ? ' selected' : '');
    sub.dataset.attrId = attr.id;

    const diamond = document.createElement('span');
    diamond.className = 'attr-sub-diamond';
    diamond.style.color = color;
    diamond.textContent = '\u25c6';

    const label = document.createElement('span');
    label.className = 'attr-sub-label';

    if (isSelected) {
      // Inline type select
      const typeSel = document.createElement('select');
      typeSel.className = 'ann-edit-select';
      typeSel.title = 'Change attribute type';
      state.attrTypes.forEach(at2 => {
        const opt = document.createElement('option');
        opt.value = at2.id;
        opt.textContent = at2.name;
        if (at2.id === attr.attrTypeId) opt.selected = true;
        typeSel.appendChild(opt);
      });
      typeSel.addEventListener('click', e => e.stopPropagation());
      typeSel.addEventListener('change', e => {
        e.stopPropagation();
        pushUndo();
        const target = state.attrAnnotations.find(a => a.id === attr.id);
        if (target) target.attrTypeId = e.target.value;
        render();
      });

      // Inline parent select
      const parentSel = document.createElement('select');
      parentSel.className = 'ann-edit-select';
      parentSel.title = 'Change parent entity or relationship';
      state.annotations.forEach(a => {
        const aEt = state.entityTypes.find(e => e.id === a.entityTypeId);
        const opt = document.createElement('option');
        opt.value = `entity:${a.id}`;
        opt.textContent = `${a.text} (${aEt ? aEt.name : '?'})`;
        if (attr.parentType === 'entity' && attr.parentId === a.id) opt.selected = true;
        parentSel.appendChild(opt);
      });
      state.relAnnotations.forEach(r => {
        const rRt = state.relationshipTypes.find(t => t.id === r.relTypeId);
        const opt = document.createElement('option');
        opt.value = `relationship:${r.id}`;
        opt.textContent = `\u2194 ${rRt ? rRt.name : '?'}: "${r.text}"`;
        if (attr.parentType === 'relationship' && attr.parentId === r.id) opt.selected = true;
        parentSel.appendChild(opt);
      });
      parentSel.addEventListener('click', e => e.stopPropagation());
      parentSel.addEventListener('change', e => {
        e.stopPropagation();
        pushUndo();
        const target = state.attrAnnotations.find(a => a.id === attr.id);
        if (target) {
          const [pType, pId] = e.target.value.split(':');
          target.parentType = pType;
          target.parentId   = pId;
        }
        render();
      });

      label.appendChild(typeSel);
      label.appendChild(parentSel);
    } else {
      label.textContent = `${at ? at.name : '?'}: "${attr.text}"  \u00b7  ${attr.start}\u2013${attr.end}`;
      label.style.color = color;
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'annotation-delete-btn attr-del-btn';
    delBtn.title = 'Delete attribute';
    delBtn.textContent = '\u00d7';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      deleteAttrAnnotation(attr.id);
    });

    sub.appendChild(diamond);
    sub.appendChild(label);
    sub.appendChild(delBtn);

    sub.addEventListener('click', e => {
      e.stopPropagation();
      state.selectedAttrAnnId     = (state.selectedAttrAnnId === attr.id) ? null : attr.id;
      state.selectedAnnotationId  = null;
      state.selectedRelAnnId      = null;
      render();
      if (state.mode === 'labeling') {
        const span = DOM.textDisplay.querySelector(`[data-attr-id="${attr.id}"]`);
        if (span) span.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    DOM.annotationsList.appendChild(sub);
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
  // Remove attributes whose parent was this entity
  state.attrAnnotations = state.attrAnnotations.filter(a => !(a.parentType === 'entity' && a.parentId === id));
  if (state.selectedAnnotationId === id) state.selectedAnnotationId = null;
  render();
}

function deleteRelAnnotation(id) {
  pushUndo();
  state.relAnnotations = state.relAnnotations.filter(a => a.id !== id);
  // Remove attributes whose parent was this relationship
  state.attrAnnotations = state.attrAnnotations.filter(a => !(a.parentType === 'relationship' && a.parentId === id));
  if (state.selectedRelAnnId === id) state.selectedRelAnnId = null;
  render();
}

function deleteAttrAnnotation(id) {
  pushUndo();
  state.attrAnnotations = state.attrAnnotations.filter(a => a.id !== id);
  if (state.selectedAttrAnnId === id) state.selectedAttrAnnId = null;
  render();
}

function deleteAttrType(id) {
  const count = state.attrAnnotations.filter(a => a.attrTypeId === id).length;
  const msg = count > 0
    ? `Delete attribute type and its ${count} annotation(s)?`
    : 'Delete this attribute type?';
  confirm(msg, () => {
    pushUndo();
    state.attrTypes = state.attrTypes.filter(at => at.id !== id);
    state.attrAnnotations = state.attrAnnotations.filter(a => a.attrTypeId !== id);
    if (state.activeAttrTypeId === id) state.activeAttrTypeId = null;
    render();
  });
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
    attrAnnotations: state.attrAnnotations,
    attrTypes: state.attrTypes,
    activeEntityTypeId: state.activeEntityTypeId,
    activeRelTypeId: state.activeRelTypeId,
    activeAttrTypeId: state.activeAttrTypeId,
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
  state.attrAnnotations = prev.attrAnnotations || [];
  state.attrTypes = prev.attrTypes || state.attrTypes;
  state.activeEntityTypeId = prev.activeEntityTypeId;
  state.activeRelTypeId = prev.activeRelTypeId || null;
  state.activeAttrTypeId = prev.activeAttrTypeId || null;
  state.mode = prev.mode;
  state.selectedAnnotationId = null;
  state.selectedRelAnnId = null;
  state.selectedAttrAnnId = null;
  DOM.rawTextInput.value = state.text;
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

// Increment whenever defaults change; forces type reset.
const ENTITY_SCHEMA_VERSION = 5;

function saveToStorage() {
  try {
    localStorage.setItem('ner-plugin-state', JSON.stringify({
      schemaVersion: ENTITY_SCHEMA_VERSION,
      text: state.text,
      entityTypes: state.entityTypes,
      annotations: state.annotations,
      relationshipTypes: state.relationshipTypes,
      relAnnotations: state.relAnnotations,
      attrTypes: state.attrTypes,
      attrAnnotations: state.attrAnnotations,
      activeEntityTypeId: state.activeEntityTypeId,
      activeRelTypeId: state.activeRelTypeId,
      activeAttrTypeId: state.activeAttrTypeId,
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
      state.attrTypes         = saved.attrTypes         || state.attrTypes;
    }
    state.text               = saved.text               || '';
    state.annotations        = saved.annotations        || [];
    state.relAnnotations     = saved.relAnnotations     || [];
    state.attrAnnotations    = saved.attrAnnotations    || [];
    state.activeEntityTypeId = saved.activeEntityTypeId  || null;
    state.activeRelTypeId    = saved.activeRelTypeId     || null;
    state.activeAttrTypeId   = saved.activeAttrTypeId    || null;
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
