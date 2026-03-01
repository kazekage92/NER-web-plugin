/* Lightweight rule-based NER engine — no external dependencies */
window.NEREngine = (function () {
  'use strict';

  /* ── entity patterns ── */

  const DATE_RE = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember))\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b|\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+\w+\s+\d{1,2},?\s+\d{4}\b|\b(?:Q[1-4]|H[12])\s+\d{4}\b/gi;

  const MONEY_RE = /\$\s*[\d,]+(?:\.\d{1,2})?(?:\s*(?:million|billion|trillion|[MBT]))?\b|\b[\d,]+(?:\.\d{1,2})?\s*(?:million|billion|trillion)?\s*(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|dollars?|euros?|pounds?|yuan|yen)\b/gi;

  const ORG_SUFFIX_RE = /\b(?:[A-Z][a-zA-Z&'\-]+(?:\s+[A-Z][a-zA-Z&'\-]+)*\s+(?:Inc\.?|Corp\.?|Ltd\.?|LLC|LLP|PLC|Co\.?|Company|Companies|Group|Holdings?|Ventures?|Partners?|Foundation|Institute|University|College|School|Hospital|Clinic|Center|Centre|Bank|Fund|Trust|Association|Society|Federation|Union|Alliance|Coalition|Organization|Department|Agency|Bureau|Ministry|Commission|Committee|Board|Council|Authority|Corporation|Enterprise|Industries|International|Global|National|Federal|Systems?|Solutions?|Technologies?|Services?|Networks?|Labs?|Studios?|Media|Press|Times|Post|Journal|News|Capital|Investments?))\b/g;

  // ALL-CAPS acronyms 2–5 chars surrounded by context (skip single letters, common words)
  const ACRONYM_SKIP = new Set(['IS','IT','AN','IN','ON','AT','OR','TO','OF','AS','BY','SO','IF','UP','US','UK','EU','UN','THE','AND','FOR','BUT','NOT','ARE','WAS','HAS','HAD','ITS','THE','WHO','HOW','WHY','WHAT','WHEN','WHERE']);
  const ACRONYM_RE = /\b[A-Z]{2,5}\b/g;

  const FIRST_NAMES = new Set([
    'James','John','Robert','Michael','William','David','Richard','Joseph','Thomas','Charles',
    'Christopher','Daniel','Matthew','Anthony','Mark','Donald','Steven','Paul','Andrew','Joshua',
    'Kenneth','Kevin','Brian','George','Timothy','Ronald','Edward','Jason','Jeffrey','Ryan',
    'Jacob','Gary','Nicholas','Eric','Jonathan','Stephen','Larry','Justin','Scott','Brandon',
    'Benjamin','Samuel','Raymond','Gregory','Frank','Alexander','Patrick','Jack','Dennis','Jerry',
    'Tyler','Aaron','Jose','Adam','Henry','Nathan','Douglas','Zachary','Peter','Kyle','Walter',
    'Ethan','Jeremy','Harold','Keith','Christian','Roger','Noah','Gerald','Carl','Terry','Sean',
    'Austin','Arthur','Lawrence','Jesse','Dylan','Bryan','Joe','Jordan','Billy','Bruce','Albert',
    'Willie','Gabriel','Logan','Alan','Juan','Wayne','Roy','Ralph','Randy','Eugene','Vincent',
    'Russell','Elijah','Louis','Bobby','Philip','Johnny','Harry','Jimmy','Todd','Victor','Ivan',
    'Mary','Patricia','Jennifer','Linda','Barbara','Elizabeth','Susan','Jessica','Sarah','Karen',
    'Lisa','Nancy','Betty','Margaret','Sandra','Ashley','Dorothy','Kimberly','Emily','Donna',
    'Michelle','Carol','Amanda','Melissa','Deborah','Stephanie','Rebecca','Sharon','Laura',
    'Cynthia','Kathleen','Amy','Angela','Shirley','Anna','Brenda','Pamela','Emma','Nicole',
    'Helen','Samantha','Katherine','Christine','Debra','Rachel','Carolyn','Janet','Catherine',
    'Maria','Heather','Diane','Julie','Joyce','Victoria','Ruth','Virginia','Lauren','Kelly',
    'Christina','Joan','Evelyn','Judith','Andrea','Hannah','Megan','Cheryl','Jacqueline',
    'Martha','Madison','Teresa','Gloria','Sara','Janice','Ann','Kathryn','Abigail','Sophia',
    'Frances','Jean','Alice','Judy','Isabella','Julia','Grace','Amber','Denise','Danielle',
    'Marilyn','Beverly','Charlotte','Natalie','Theresa','Diana','Brittany','Kayla','Alexis',
    'Lori','Marie','Olivia','Ava','Mia','Chloe','Ella','Zoe','Lily','Aria','Aurora','Ellie',
    'Liam','Noah','Oliver','Elijah','Aiden','Lucas','Mason','Ethan','Asher','Leo',
    // International
    'Mohammed','Muhammad','Ali','Omar','Ahmed','Hassan','Ibrahim','Fatima','Aisha',
    'Wei','Li','Zhang','Wang','Liu','Chen','Yang','Zhao','Wu','Zhou',
    'Raj','Priya','Amit','Deepa','Rahul','Pooja','Arjun','Sanjay',
    'Pierre','Jean','Marie','Francois','Sophie','Nicolas','Antoine','Isabelle',
    'Hans','Klaus','Stefan','Anna','Maria','Peter','Martin','Elena',
    'Carlos','Miguel','Juan','Diego','Sofia','Valentina','Sebastian','Mateo',
    'Boris','Dmitri','Ivan','Natasha','Alexei','Olga','Sergei','Tatiana',
    'Yusuf','Amir','Leila','Nadia','Karim','Zara','Tariq','Hana'
  ]);

  const COUNTRIES = new Set([
    'Afghanistan','Albania','Algeria','Angola','Argentina','Armenia','Australia','Austria',
    'Azerbaijan','Bangladesh','Belarus','Belgium','Bolivia','Brazil','Bulgaria','Cambodia',
    'Cameroon','Canada','Chile','China','Colombia','Croatia','Cuba','Denmark','Ecuador',
    'Egypt','Ethiopia','Finland','France','Georgia','Germany','Ghana','Greece','Guatemala',
    'Hungary','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Japan','Jordan',
    'Kazakhstan','Kenya','Kuwait','Lebanon','Libya','Malaysia','Mexico','Morocco','Myanmar',
    'Nepal','Netherlands','Nigeria','Norway','Pakistan','Peru','Philippines','Poland',
    'Portugal','Romania','Russia','Saudi Arabia','Serbia','Singapore','Somalia','Spain',
    'Sudan','Sweden','Switzerland','Syria','Taiwan','Tanzania','Thailand','Tunisia',
    'Turkey','Uganda','Ukraine','Vietnam','Yemen','Zimbabwe',
    'United States','United Kingdom','United Arab Emirates','South Africa','South Korea',
    'North Korea','New Zealand','Hong Kong','Sri Lanka'
  ]);

  const GEO_SUFFIX_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|Avenue|Boulevard|Road|Drive|Lane|Way|Place|Court|Park|Square|Bridge|River|Lake|Sea|Ocean|Mountain|Mountains|Bay|Island|Peninsula|Valley|Desert|Forest|Beach|Harbor|Port|Airport|Station|District|County|Province|Region|Territory|City|Town|Village|Gulf)\b/g;

  /* ── helpers ── */

  function addMatches(results, re, type) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(re.source ? re : '')) !== null) break; // reset trick below
    re.lastIndex = 0;
    const seen = new Set();
    while ((m = re.exec(results._text)) !== null) {
      const key = `${m.index}:${m.index + m[0].length}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ start: m.index, end: m.index + m[0].length, type });
      }
    }
  }

  function detectPersons(text, results) {
    // Match "FirstName [MiddleName] LastName" where FirstName is in our list
    // LastName must start with uppercase
    const re = /\b([A-Z][a-z]{1,15})(?:\s+[A-Z][a-z]{1,15}){1,3}\b/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const parts = m[0].split(/\s+/);
      if (FIRST_NAMES.has(parts[0])) {
        results.push({ start: m.index, end: m.index + m[0].length, type: 'PERSON' });
      }
    }
  }

  function detectLocations(text, results) {
    // Countries
    COUNTRIES.forEach(country => {
      const re = new RegExp(`\\b${country.replace(/\s/g, '\\s+')}\\b`, 'g');
      let m;
      while ((m = re.exec(text)) !== null) {
        results.push({ start: m.index, end: m.index + m[0].length, type: 'LOCATION' });
      }
    });
    // Geo suffixes
    let m;
    GEO_SUFFIX_RE.lastIndex = 0;
    while ((m = GEO_SUFFIX_RE.exec(text)) !== null) {
      results.push({ start: m.index, end: m.index + m[0].length, type: 'LOCATION' });
    }
  }

  /* ── dedup & sort ── */

  function dedup(matches) {
    matches.sort((a, b) => a.start - b.start || b.end - a.end);
    const out = [];
    let last = -1;
    for (const m of matches) {
      if (m.start >= last) { out.push(m); last = m.end; }
    }
    return out;
  }

  /* ── public API ── */

  function detect(text) {
    const results = [];
    results._text = text;

    // Run patterns
    DATE_RE.lastIndex = 0;
    let m;
    while ((m = DATE_RE.exec(text)) !== null)
      results.push({ start: m.index, end: m.index + m[0].length, type: 'DATE' });

    MONEY_RE.lastIndex = 0;
    while ((m = MONEY_RE.exec(text)) !== null)
      results.push({ start: m.index, end: m.index + m[0].length, type: 'MONEY' });

    ORG_SUFFIX_RE.lastIndex = 0;
    while ((m = ORG_SUFFIX_RE.exec(text)) !== null)
      results.push({ start: m.index, end: m.index + m[0].length, type: 'ORG' });

    ACRONYM_RE.lastIndex = 0;
    while ((m = ACRONYM_RE.exec(text)) !== null) {
      if (!ACRONYM_SKIP.has(m[0]))
        results.push({ start: m.index, end: m.index + m[0].length, type: 'ORG' });
    }

    detectPersons(text, results);
    detectLocations(text, results);

    return dedup(results);
  }

  return { detect };
})();
