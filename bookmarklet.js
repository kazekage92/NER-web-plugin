/* NER Entity Labeler — bookmarklet bundle */
(function () {
  'use strict';
  if (window.__nerBMLoaded) { window.__nerBMRescan && window.__nerBMRescan(); return; }
  window.__nerBMLoaded = true;

  /* ── NER engine ── */
  const DATE_RE   = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember))\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b|\b(?:Q[1-4]|H[12])\s+\d{4}\b/gi;
  const MONEY_RE  = /\$\s*[\d,]+(?:\.\d{1,2})?(?:\s*(?:million|billion|trillion|[MBT]))?\b|\b[\d,]+(?:\.\d{1,2})?\s*(?:million|billion|trillion)?\s*(?:USD|EUR|GBP|JPY|CAD|AUD|RM|MYR|SGD|HKD|dollars?|euros?|pounds?|yuan|yen|ringgit)\b/gi;
  const ORG_RE    = /\b(?:[A-Z][a-zA-Z&'\-]+(?:\s+[A-Z][a-zA-Z&'\-]+)*\s+(?:Inc\.?|Corp\.?|Ltd\.?|LLC|LLP|PLC|Co\.?|Company|Group|Holdings?|Foundation|Institute|University|College|School|Hospital|Bank|Fund|Trust|Association|Federation|Union|Alliance|Organization|Department|Agency|Bureau|Ministry|Commission|Council|Authority|Corporation|Industries|International|Global|National|Systems?|Solutions?|Technologies?|Services?|Networks?|Labs?|Media|Press|Times|Post|Capital|Berhad|Bhd\.?))\b/g;
  const ACRONYM_SKIP = new Set(['IS','IT','AN','IN','ON','AT','OR','TO','OF','AS','BY','SO','IF','UP','US','UK','EU','UN','WHO','HOW','WHY','THE','AND','FOR','BUT','NOT','ARE','WAS','HAS','EPC','OEM','MOU','IPO','AGM','EGM','PPP','BOT','BOO','SPV','SPC','JV','CSR','ESG','GST','SST','OPR','GDP','AI','CEO','CFO','COO','CTO','MD','PPA','SaaS','R&D','MYR','SGD','HKD','RM','GBP','USD','EUR','RAM','MARC']);
  const FIRST_NAMES = new Set(['James','John','Robert','Michael','William','David','Richard','Joseph','Thomas','Charles','Christopher','Daniel','Matthew','Anthony','Mark','Donald','Steven','Paul','Andrew','Joshua','Kenneth','Kevin','Brian','George','Timothy','Ronald','Edward','Jason','Jeffrey','Ryan','Jacob','Gary','Nicholas','Eric','Jonathan','Stephen','Larry','Justin','Scott','Brandon','Benjamin','Samuel','Raymond','Frank','Alexander','Patrick','Jack','Tyler','Aaron','Jose','Adam','Henry','Nathan','Peter','Kyle','Ethan','Jeremy','Keith','Noah','Carl','Sean','Austin','Arthur','Jesse','Dylan','Bryan','Victor','Ivan','Harry','Jimmy','Todd','Mary','Patricia','Jennifer','Linda','Barbara','Elizabeth','Susan','Jessica','Sarah','Karen','Lisa','Nancy','Betty','Margaret','Sandra','Ashley','Dorothy','Kimberly','Emily','Donna','Michelle','Carol','Amanda','Melissa','Deborah','Stephanie','Rebecca','Sharon','Laura','Cynthia','Amy','Angela','Anna','Brenda','Emma','Nicole','Helen','Samantha','Katherine','Christine','Rachel','Carolyn','Janet','Catherine','Maria','Heather','Diane','Julie','Victoria','Ruth','Lauren','Kelly','Christina','Joan','Evelyn','Andrea','Hannah','Megan','Martha','Madison','Teresa','Sara','Sophia','Julia','Grace','Charlotte','Natalie','Diana','Olivia','Ava','Mia','Chloe','Ella','Zoe','Lily','Liam','Noah','Oliver','Elijah','Aiden','Lucas','Mason','Asher','Leo','Mohammed','Muhammad','Ali','Omar','Ahmed','Hassan','Ibrahim','Fatima','Aisha','Pierre','Jean','Marie','Francois','Sophie','Nicolas','Hans','Klaus','Stefan','Carlos','Miguel','Diego','Sofia','Valentina','Sebastian','Mateo','Boris','Dmitri','Natasha','Alexei','Sergei','Raj','Priya','Amit','Rahul','Pooja','Arjun','Ahmad','Siti','Nurul','Mohd','Nor','Zulkifli','Tan','Lee','Wong','Lim','Chan','Ng','Yap','Khoo','Cheah','Goh']);
  const COUNTRIES  = new Set(['Afghanistan','Albania','Algeria','Angola','Argentina','Armenia','Australia','Austria','Azerbaijan','Bangladesh','Belarus','Belgium','Bolivia','Brazil','Bulgaria','Cambodia','Cameroon','Canada','Chile','China','Colombia','Croatia','Cuba','Denmark','Ecuador','Egypt','Ethiopia','Finland','France','Georgia','Germany','Ghana','Greece','Guatemala','Hungary','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Japan','Jordan','Kazakhstan','Kenya','Kuwait','Lebanon','Libya','Malaysia','Mexico','Morocco','Myanmar','Nepal','Netherlands','Nigeria','Norway','Pakistan','Peru','Philippines','Poland','Portugal','Romania','Russia','Saudi Arabia','Serbia','Singapore','Somalia','Spain','Sudan','Sweden','Switzerland','Syria','Taiwan','Tanzania','Thailand','Tunisia','Turkey','Uganda','Ukraine','Vietnam','Yemen','Zimbabwe','United States','United Kingdom','United Arab Emirates','South Africa','South Korea','North Korea','New Zealand','Hong Kong','Sri Lanka']);
  const GEO_RE     = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|Avenue|Boulevard|Road|Drive|Lane|Park|Square|Bridge|River|Lake|Sea|Ocean|Mountain|Bay|Island|Valley|Desert|Beach|Harbor|Port|Airport|Station|District|County|Province|Region|Territory|City|Town|Village|Gulf)\b/g;

  function detect(text) {
    const res = [];
    function add(re, type) { re.lastIndex = 0; let m; while ((m = re.exec(text)) !== null) res.push({ start: m.index, end: m.index + m[0].length, type }); }
    add(DATE_RE, 'DATE'); add(MONEY_RE, 'MONEY'); add(ORG_RE, 'ORG');
    const aRe = /\b[A-Z]{2,5}\b/g; let m;
    while ((m = aRe.exec(text)) !== null) if (!ACRONYM_SKIP.has(m[0])) res.push({ start: m.index, end: m.index + m[0].length, type: 'ORG' });
    const pRe = /\b([A-Z][a-z]{1,15})(?:\s+[A-Z][a-z]{1,15}){1,3}\b/g;
    while ((m = pRe.exec(text)) !== null) if (FIRST_NAMES.has(m[0].split(' ')[0])) res.push({ start: m.index, end: m.index + m[0].length, type: 'PERSON' });
    COUNTRIES.forEach(c => { const re = new RegExp(`\\b${c.replace(/\s/g,'\\s+')}\\b`,'g'); while ((m = re.exec(text)) !== null) res.push({ start: m.index, end: m.index + m[0].length, type: 'LOCATION' }); });
    GEO_RE.lastIndex = 0;
    while ((m = GEO_RE.exec(text)) !== null) res.push({ start: m.index, end: m.index + m[0].length, type: 'LOCATION' });
    res.sort((a, b) => a.start - b.start || b.end - a.end);
    const out = []; let last = -1;
    for (const r of res) { if (r.start >= last) { out.push(r); last = r.end; } }
    return out;
  }

  /* ── entity colors ── */
  const COLORS = { PERSON:'#e74c3c', ORG:'#3498db', LOCATION:'#2ecc71', DATE:'#f39c12', MONEY:'#9b59b6' };

  /* ── Relation catalog: text-phrase patterns that signal a relationship ── */
  /* Each entry: { cat, label, color, pat: [RegExp with gi flags] }           */
  /* Matching strategy: find keyword phrase between two entity marks.          */
  const RELATION_CATALOG = [
    // ── Merger, Acquisition and Takeover ──────────────────────────────────
    { cat:'M&A', color:'#e74c3c', label:'Acquires / Merges / Consolidates With',
      pat:[/\b(?:acquir(?:es?|ed|ing)|merg(?:es?|ed|er|ing)|consolidat(?:es?|ed|ing)|takeover|took\s+over|taking\s+over|takes?\s+over)\b/gi] },
    { cat:'M&A', color:'#e74c3c', label:'Acquires / Merges / Consolidates Company In',
      pat:[/\b(?:acquir(?:es?|ed|ing)|merg(?:es?|ed|ing))\b[^.]{0,80}\bin\b/gi] },
    { cat:'M&A', color:'#c0392b', label:'Opposes Merger With',
      pat:[/\b(?:oppos(?:es?|ed|ing)|block(?:s|ed|ing)|reject(?:s|ed|ing)|resist(?:s|ed|ing))\b[^.]{0,60}\bmerger?\b/gi,
           /\bmerger?\b[^.]{0,60}\b(?:oppos(?:es?|ed|ing)|block(?:s|ed|ing)|reject(?:s|ed|ing))\b/gi] },
    { cat:'M&A', color:'#e74c3c', label:'Becomes Unconditional',
      pat:[/\b(?:becom(?:es?|ing)|became|turn(?:ed|s|ing))\s+unconditional\b/gi,
           /\bunconditional(?:ly)?\b/gi] },
    { cat:'M&A', color:'#e74c3c', label:'Funds Acquisition Through',
      pat:[/\b(?:fund(?:ed|s|ing)|financ(?:ed|es|ing)|back(?:ed|s|ing))\b[^.]{0,60}\bacquisition\b/gi,
           /\bacquisition\b[^.]{0,60}\b(?:fund(?:ed|s|ing)|financ(?:ed|es|ing))\b/gi] },
    { cat:'M&A', color:'#e74c3c', label:'Takes Over Operations Of',
      pat:[/\btakes?\s+over\s+(?:the\s+)?(?:operations?|management|control|business)\b/gi,
           /\btook\s+over\s+(?:the\s+)?(?:operations?|management|control)\b/gi] },
    { cat:'M&A', color:'#e74c3c', label:'Becomes Bookrunner Of',
      pat:[/\b(?:joint\s+(?:global\s+)?)?bookrunner\b/gi,
           /\blead\s+manager\b/gi] },
    { cat:'M&A', color:'#e74c3c', label:'Grants Exclusive Negotiation Rights To',
      pat:[/\b(?:grant(?:ed|s|ing)?|gave|given)\b[^.]{0,40}\bexclusive\b[^.]{0,40}\bnegotiat\w+\b/gi,
           /\bexclusive\s+(?:negotiation|dealing)\s+rights?\b/gi] },

    // ── Privatisation ─────────────────────────────────────────────────────
    { cat:'Privatisation', color:'#e67e22', label:'Privatise From',
      pat:[/\bprivati[sz](?:es?|ed|ing|ation)\b/gi] },
    { cat:'Privatisation', color:'#e67e22', label:'Largest Privatisation In',
      pat:[/\blargest\b[^.]{0,40}\bprivati[sz](?:es?|ed|ing|ation)\b/gi,
           /\bprivatisation\b[^.]{0,40}\b(?:record|history|ever)\b/gi] },
    { cat:'Privatisation', color:'#e67e22', label:'Privatises Due To',
      pat:[/\bprivati[sz](?:es?|ed|ing)\b[^.]{0,60}\b(?:due\s+to|because|owing\s+to|as\s+a\s+result)\b/gi] },

    // ── Investment, Divestment and Exit ───────────────────────────────────
    { cat:'Investment', color:'#f39c12', label:'Provides Concessionary Funding Through',
      pat:[/\bconcess(?:ionary|ion(?:al)?)\s+(?:fund(?:ing)?|financ(?:ing|e)|loan|rate)\b/gi,
           /\bsubsidis(?:ed)?\s+(?:loan|fund(?:ing)?|rate)\b/gi] },
    { cat:'Investment', color:'#f39c12', label:'Divests / Sells / Spins Off',
      pat:[/\b(?:divest(?:s|ed|ing|ment|iture)?|spin(?:s|ning)?\s+off|spun\s+off|hive[sd]?\s+off|carve[sd]?\s+out)\b/gi,
           /\b(?:sell(?:ing|s)?|sold|dispos(?:es?|ed|ing|al))\b[^.]{0,40}\b(?:stake|unit|division|subsidiary|asset)\b/gi] },
    { cat:'Investment', color:'#f39c12', label:'Proposes Disposal Of',
      pat:[/\b(?:propos(?:es?|ed|ing)|plan(?:s|ned|ning)?|intend(?:s|ed|ing)?)\b[^.]{0,40}\b(?:dispos(?:al|es?|ed|ing)|sell(?:ing)?)\b/gi] },
    { cat:'Investment', color:'#f39c12', label:'Proposes Winding Up',
      pat:[/\bwind(?:ing)?\s+up\b/gi, /\bwound\s+up\b/gi,
           /\bliquidat(?:es?|ed|ing|ion)\b/gi, /\bvoluntary\s+liquidation\b/gi] },
    { cat:'Investment', color:'#f39c12', label:'Carves Out Unit For Listing',
      pat:[/\bcarve[sd]?\s+out\b[^.]{0,60}\b(?:list(?:ing|ed)?|IPO)\b/gi,
           /\b(?:list(?:ing|ed)?|IPO)\b[^.]{0,60}\bcarve[sd]?\s+out\b/gi] },

    // ── Corporate Restructuring and Financial Health ───────────────────────
    { cat:'Restructuring', color:'#1abc9c', label:'Undergoes Corporate Restructuring',
      pat:[/\b(?:corpor(?:ate|ation)\s+)?restructur(?:ing|es?|ed)\b/gi,
           /\bscheme\s+of\s+arrangement\b/gi] },
    { cat:'Restructuring', color:'#1abc9c', label:'Exits PN17 Through',
      pat:[/\b(?:exit(?:s|ed|ing)?|reclassif(?:ied|y|ication))\b[^.]{0,40}\bPN1[57]\b/gi,
           /\bPN1[57]\b[^.]{0,40}\b(?:exit(?:s|ed|ing)?|regulariz(?:es?|ed|ing))\b/gi] },
    { cat:'Restructuring', color:'#1abc9c', label:'Regularises Financial Position With',
      pat:[/\bregulari[sz](?:es?|ed|ing|ation)\b[^.]{0,40}\bfinancial\b/gi,
           /\bfinancial\s+(?:position|health|standing)\b[^.]{0,40}\b(?:restored?|improved?|regulariz)\b/gi] },
    { cat:'Restructuring', color:'#1abc9c', label:'Reported / Released Quarterly Report On',
      pat:[/\b(?:quarterly|Q[1-4])\s+(?:report|result|financial|earnings?)\b/gi,
           /\b(?:report(?:ed|s|ing)?|releas(?:ed|es|ing))\b[^.]{0,40}\bquarterly\b/gi] },
    { cat:'Restructuring', color:'#1abc9c', label:'Reported / Released Annual Report On',
      pat:[/\bannual\s+(?:report|result|financial|earnings?)\b/gi,
           /\b(?:report(?:ed|s|ing)?|releas(?:ed|es|ing))\b[^.]{0,40}\bannual\b/gi] },
    { cat:'Restructuring', color:'#1abc9c', label:'Has Unbilled Sales Of',
      pat:[/\bunbilled\s+(?:sales?|revenue|order)\b/gi] },
    { cat:'Restructuring', color:'#1abc9c', label:'Improves Balance Sheet Via',
      pat:[/\b(?:improv(?:es?|ed|ing)|strengthen(?:ed|s|ing)?)\b[^.]{0,40}\bbalance\s+sheet\b/gi,
           /\bbalance\s+sheet\b[^.]{0,40}\b(?:improv(?:es?|ed|ing)|strengthen)\b/gi] },
    { cat:'Restructuring', color:'#1abc9c', label:'Reduces Borrowings Through',
      pat:[/\b(?:reduc(?:es?|ed|ing|tion)|lower(?:ed|s|ing)?|cut(?:ting|s)?)\b[^.]{0,40}\bborrow(?:ing|ings)?\b/gi,
           /\bdeleverage[sd]?\b/gi] },
    { cat:'Restructuring', color:'#1abc9c', label:'Increases Liquidity Through',
      pat:[/\b(?:increas(?:es?|ed|ing)|boost(?:ed|s|ing)?|improv(?:es?|ed|ing))\b[^.]{0,40}\bliquid(?:ity)?\b/gi] },
    { cat:'Restructuring', color:'#c0392b', label:'Experiencing Financial Risk In',
      pat:[/\bfinancial\s+(?:risk|distress|difficult(?:y|ies)|strain|crisis)\b/gi,
           /\bgoing\s+concern\b/gi, /\bimpaired?\b[^.]{0,40}\b(?:asset|loan|debt)\b/gi] },
    { cat:'Restructuring', color:'#c0392b', label:'Experiencing Bankruptcy Risk Due To',
      pat:[/\bbankrupt(?:cy)?\b/gi, /\binsolvenc(?:y|ies)\b/gi,
           /\b(?:default(?:ed|ing)?|unable\s+to\s+pay)\b/gi, /\bPN17\b/gi] },

    // ── Shareholding and Investment ───────────────────────────────────────
    { cat:'Shareholding', color:'#3498db', label:'Takes Stake In',
      pat:[/\b(?:takes?|took|acquir(?:es?|ed|ing)|purchas(?:es?|ed|ing)|buy(?:ing)?|bought)\b[^.]{0,40}\b(?:stake|sharehold(?:ing|er)|equity|interest)\b/gi,
           /\b(?:stake|equity\s+interest)\b[^.]{0,40}\b(?:acquir(?:es?|ed)|purchas(?:es?|ed))\b/gi] },
    { cat:'Shareholding', color:'#3498db', label:'Stake Increase / Decrease Through',
      pat:[/\bstake\b[^.]{0,40}\b(?:increas(?:es?|ed|ing)|rais(?:es?|ed|ing)|hik(?:es?|ed|ing)|reduc(?:es?|ed|ing)|decreas(?:es?|ed|ing)|dilut(?:es?|ed|ing))\b/gi,
           /\b(?:increas(?:es?|ed|ing)|reduc(?:es?|ed|ing))\b[^.]{0,40}\bsharehold(?:ing|ers?)\b/gi] },
    { cat:'Shareholding', color:'#3498db', label:'Shareholder Holds In',
      pat:[/\b(?:hold(?:s|ing)?|held|own(?:s|ed|ing)?)\b[^.]{0,40}\b(?:shares?|stake|equity\s+interest|sharehold(?:ing))\b/gi] },
    { cat:'Shareholding', color:'#3498db', label:'Ceased To Be Shareholder In',
      pat:[/\b(?:ceas(?:es?|ed|ing)\s+to\s+be|no\s+longer\s+(?:a\s+)?sharehold(?:er|ing))\b/gi,
           /\b(?:exit(?:s|ed|ing)?|disposed?\s+of|sold?)\b[^.]{0,40}\bentire\b[^.]{0,40}\bstake\b/gi] },
    { cat:'Shareholding', color:'#3498db', label:'Has Subsidiary Relationship With',
      pat:[/\b(?:subsidiar(?:y|ies)|wholly.?owned\s+(?:subsidiary|unit)|unit\s+of)\b/gi] },
    { cat:'Shareholding', color:'#3498db', label:'Has Associate Relationship With',
      pat:[/\bassociat(?:es?|ed)\s+(?:company|compan(?:y|ies)|firm|entity)\b/gi,
           /\b(?:associate|associated)\b[^.]{0,20}\bcompan(?:y|ies)\b/gi] },
    { cat:'Shareholding', color:'#3498db', label:'Is Backed By',
      pat:[/\b(?:back(?:ed|s|ing)?|support(?:ed|s|ing)?|fund(?:ed|s|ing)?)\s+by\b/gi,
           /\b(?:investor|PE|VC|private\s+equity).?back(?:ed)?\b/gi] },
    { cat:'Shareholding', color:'#3498db', label:'Sponsorship Of / By',
      pat:[/\bspons(?:ors?|or(?:ed|ing|ship))\b/gi] },
    { cat:'Shareholding', color:'#3498db', label:'Endorsement With',
      pat:[/\b(?:endors(?:es?|ed|ing|ement))\b/gi] },

    // ── Capital Markets ───────────────────────────────────────────────────
    { cat:'Capital Markets', color:'#9b59b6', label:'Equity Issuance To',
      pat:[/\b(?:issu(?:es?|ed|ing|ance))\b[^.]{0,40}\b(?:new\s+)?shares?\b/gi,
           /\bequity\s+(?:issu(?:ance|es?)|offer(?:ing)?)\b/gi,
           /\bshare\s+issu(?:ance|es?)\b/gi] },
    { cat:'Capital Markets', color:'#9b59b6', label:'Issues Warrant In',
      pat:[/\b(?:issu(?:es?|ed|ing|ance)|list(?:ed|ing|s)?)\b[^.]{0,40}\bwarrants?\b/gi,
           /\bfree\s+warrants?\b/gi] },
    { cat:'Capital Markets', color:'#9b59b6', label:'Issues Options In',
      pat:[/\b(?:issu(?:es?|ed|ing|ance)|grant(?:ed|s|ing)?)\b[^.]{0,40}\b(?:share\s+)?options?\b/gi,
           /\bESOP\b/gi, /\bESOS\b/gi] },
    { cat:'Capital Markets', color:'#9b59b6', label:'Undergoes Rights Issue To',
      pat:[/\brights?\s+(?:issue[sd]?|offer(?:ing)?)\b/gi,
           /\bRenounceable\b[^.]{0,40}\brights?\b/gi] },
    { cat:'Capital Markets', color:'#9b59b6', label:'Dilutes Shareholding Of',
      pat:[/\bdilut(?:es?|ed|ing|ion|ive)\b[^.]{0,40}\b(?:sharehold(?:ing|ers?)|equity|stake)\b/gi] },
    { cat:'Capital Markets', color:'#9b59b6', label:'Declares and Issues Bonus Shares To',
      pat:[/\bbonus\s+(?:issue|shares?)\b/gi, /\bscript\s+dividend\b/gi] },
    { cat:'Capital Markets', color:'#9b59b6', label:'Executes Primary Placement In',
      pat:[/\b(?:private\s+)?placement[sd]?\b[^.]{0,40}\b(?:new|primary|shares?)\b/gi,
           /\bprimary\b[^.]{0,40}\bplacement[sd]?\b/gi] },
    { cat:'Capital Markets', color:'#9b59b6', label:'Placement Has Discount Rate Of',
      pat:[/\bplacement[sd]?\b[^.]{0,40}\bdiscount(?:ed)?\b/gi,
           /\bdiscount(?:ed)?\b[^.]{0,40}\bplacement[sd]?\b/gi] },
    { cat:'Capital Markets', color:'#9b59b6', label:'Declares and Pays Dividend To',
      pat:[/\b(?:declar(?:es?|ed|ing)|pay(?:s|ing|ment)?|paid)\b[^.]{0,40}\bdividend[sd]?\b/gi,
           /\bdividend[sd]?\b[^.]{0,40}\b(?:declar(?:es?|ed|ing)|pay(?:s|ing|ment)?)\b/gi,
           /\bDPS\b/gi, /\bfinal\s+dividend\b/gi, /\binterim\s+dividend\b/gi] },
    { cat:'Capital Markets', color:'#9b59b6', label:'Buy-Back From',
      pat:[/\b(?:buy.?back|buyback|share\s+repurchas(?:es?|ed|ing))\b/gi] },
    { cat:'Capital Markets', color:'#9b59b6', label:'Declares Share Split To',
      pat:[/\b(?:share|stock)\s+split[sd]?\b/gi, /\bstock\s+subdivision\b/gi] },
    { cat:'Capital Markets', color:'#9b59b6', label:'Converts Share Class Into',
      pat:[/\bconvert(?:s|ed|ing)?\b[^.]{0,40}\b(?:share\s+class|preference\s+share|ordinary\s+share|redeemable\s+preference)\b/gi] },
    { cat:'Capital Markets', color:'#9b59b6', label:'Eliminates Preferential Rights Of',
      pat:[/\b(?:eliminat(?:es?|ed|ing)|remov(?:es?|ed|ing)|cancel(?:s|led|ling)?)\b[^.]{0,40}\bpreferential\s+rights?\b/gi] },
    { cat:'Capital Markets', color:'#9b59b6', label:'Enhances Voting Rights Of',
      pat:[/\b(?:enhanc(?:es?|ed|ing)|increas(?:es?|ed|ing)|boost(?:s|ed|ing)?)\b[^.]{0,40}\bvoting\s+rights?\b/gi,
           /\bdual.?class\s+share\b/gi] },
    { cat:'Capital Markets', color:'#9b59b6', label:'Launches Shareholder Activism Campaign Against',
      pat:[/\bsharehold(?:er)?\s+activism\b/gi, /\bactivist\b[^.]{0,40}\binvestor\b/gi,
           /\bproxy\s+(?:fight|battle|campaign|contest)\b/gi] },
    { cat:'Capital Markets', color:'#9b59b6', label:"Prepares Board Deliberation On",
      pat:[/\bboard\b[^.]{0,40}\b(?:deliberat(?:es?|ed|ing|ion)|consider(?:ing|ed|s)?)\b/gi] },
    { cat:'Capital Markets', color:'#9b59b6', label:"Secures Shareholders' Approval For",
      pat:[/\bshareholders?\b[^.]{0,40}\b(?:approv(?:al|es?|ed|ing))\b/gi,
           /\b(?:EGM|AGM)\b/gi, /\bextraordinary\s+general\s+meeting\b/gi] },

    // ── Debt and Financing ────────────────────────────────────────────────
    { cat:'Debt & Financing', color:'#2ecc71', label:'Loan / Credit Facility From',
      pat:[/\b(?:term\s+)?loan\b/gi, /\bcredit\s+facilit(?:y|ies)\b/gi,
           /\brevolving\s+credit\b/gi, /\boverdraft\s+facilit(?:y|ies)\b/gi,
           /\bbridge\s+(?:loan|financing)\b/gi] },
    { cat:'Debt & Financing', color:'#2ecc71', label:'Is Sole Lender Of',
      pat:[/\bsole\s+(?:lender|arranger|financier)\b/gi] },
    { cat:'Debt & Financing', color:'#2ecc71', label:'Receives End-Financing Support From',
      pat:[/\bend.?financ(?:ing|e)\b/gi, /\bbuyer\s+financ(?:ing|e)\b/gi] },
    { cat:'Debt & Financing', color:'#2ecc71', label:'Guarantee Provided By',
      pat:[/\b(?:guarant(?:ees?|y|ies|or|ed|ing)|surety|indemnif(?:y|ied|ication)|corporate\s+guarantee)\b/gi] },
    { cat:'Debt & Financing', color:'#2ecc71', label:'Debt Issuance To',
      pat:[/\b(?:bonds?|notes?|debentures?)\b[^.]{0,40}\b(?:issu(?:es?|ed|ing|ance)|offer(?:ing)?)\b/gi,
           /\bdebt\s+(?:issu(?:ance|es?)|capital\s+market|offering)\b/gi,
           /\bMTN\b/gi, /\bmedium.?term\s+note\b/gi] },
    { cat:'Debt & Financing', color:'#2ecc71', label:'Issues Sukuk To',
      pat:[/\bsukuk\b/gi, /\bIslamic\s+(?:bond|note|financing|facility)\b/gi,
           /\bmurabahah\b/gi, /\bijarah\b/gi, /\bwakalah\b/gi] },
    { cat:'Debt & Financing', color:'#2ecc71', label:'Restructures Debt With',
      pat:[/\bdebt\s+restructur(?:ing|es?|ed)\b/gi,
           /\brestructur(?:ing|es?|ed)\b[^.]{0,40}\bdebt\b/gi,
           /\bdebt\s+rescheduling\b/gi] },
    { cat:'Debt & Financing', color:'#2ecc71', label:'Receives Waiver / Forbearance From',
      pat:[/\b(?:waivers?|forbearance|covenant\s+waiver|moratorium|standstill)\b/gi] },
    { cat:'Debt & Financing', color:'#2ecc71', label:'Early Settles Debt To',
      pat:[/\b(?:early|pre(?:pay|paid|payment)|redeemed?|called?)\b[^.]{0,40}\b(?:debt|loan|bonds?|notes?)\b/gi,
           /\bprepayment\b/gi, /\bearly\s+redemption\b/gi] },
    { cat:'Debt & Financing', color:'#2ecc71', label:'Recovers Outstanding Loan From',
      pat:[/\b(?:recover(?:s|ed|ing)?|collected?|recouped?)\b[^.]{0,40}\boutstanding\b[^.]{0,40}\b(?:loan|debt|amount)\b/gi] },
    { cat:'Debt & Financing', color:'#2ecc71', label:'Faces Cross-Default Risk On',
      pat:[/\bcross.?default\b/gi] },
    { cat:'Debt & Financing', color:'#2ecc71', label:'Gains Concessionary Funding Through',
      pat:[/\b(?:gains?|secures?|receives?)\b[^.]{0,40}\bconcess(?:ionary|ional)?\b[^.]{0,40}\bfund(?:ing)?\b/gi] },
    { cat:'Debt & Financing', color:'#2ecc71', label:'Receives Rating From',
      pat:[/\b(?:credit\s+)?rating[sd]?\b[^.]{0,40}\b(?:assign(?:ed|s|ing)?|affirm(?:ed|s|ing)?|upgrad(?:ed|es?|ing)|downgrad(?:ed|es?|ing)|maintain(?:ed|s|ing)?)\b/gi,
           /\b(?:Moody|Fitch|RAM Ratings|MARC|Standard\s+&\s+Poor)\b/gi,
           /\b(?:AAA|AA\+|AA|AA-|A\+|A-|BBB|BB|CCC)\s+rating\b/gi] },

    // ── Commercial & Contractual ──────────────────────────────────────────
    { cat:'Commercial', color:'#d68910', label:'Customer Contract With',
      pat:[/\b(?:contract(?:ed|s|ing)?|agreement[sd]?)\b[^.]{0,40}\bcustomer[sd]?\b/gi,
           /\bcustomer[sd]?\b[^.]{0,40}\b(?:contract(?:ed|s|ing)?|agreement[sd]?)\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Distribution Agreement',
      pat:[/\bdistribut(?:ion|or[sd]?|ing)\b[^.]{0,40}\b(?:agreement[sd]?|deal[sd]?|contract[sd]?)\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Procurement / Purchase From',
      pat:[/\b(?:procure(?:d|s|ment|ing)?|purchas(?:es?|ed|ing)|sourc(?:es?|ed|ing)|bought)\b[^.]{0,40}\b(?:from|supplier[sd]?)\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Has Terminated Contract With',
      pat:[/\b(?:terminat(?:es?|ed|ing|ion)|cancel(?:s|led|ling|ation)?|rescind(?:s|ed|ing)?|ended?)\b[^.]{0,40}\bcontract[sd]?\b/gi,
           /\bcontract[sd]?\b[^.]{0,40}\b(?:terminat(?:es?|ed|ing|ion)|cancel(?:s|led))\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Acts as Subcontractor To',
      pat:[/\bsub.?contractor[sd]?\b/gi, /\bsubcontract(?:ed|ing|or)?\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Contract Awarded By',
      pat:[/\b(?:award(?:ed|s|ing)?|secur(?:es?|ed|ing)|win(?:s|ning)?|won)\b[^.]{0,40}\bcontract[sd]?\b/gi,
           /\bcontract[sd]?\b[^.]{0,40}\b(?:award(?:ed|s|ing)?|secur(?:es?|ed|ing))\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Contract Awarded To',
      pat:[/\bcontract[sd]?\b[^.]{0,40}\baward(?:ed)?\s+to\b/gi,
           /\baward(?:ed)?\s+to\b[^.]{0,40}\bcontract[sd]?\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Framework / Master Supply Agreement',
      pat:[/\b(?:framework|master\s+supply|master\s+service)\s+agreement[sd]?\b/gi,
           /\bMSA\b/g] },
    { cat:'Commercial', color:'#d68910', label:'EPC / O&M Contract With',
      pat:[/\bEPC\b/g, /\bO&M\b/g,
           /\boperations?\s+(?:and|&)\s+maintenance\b/gi,
           /\bengineering,?\s+procurement,?\s+(?:and\s+)?construction\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Reactivates Production Facilities Of',
      pat:[/\breactivat(?:es?|ed|ing)\b[^.]{0,40}\b(?:facilit(?:y|ies)|plant|production|line)\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Expands Production Capacity In',
      pat:[/\b(?:expands?|increas(?:es?|ed|ing))\b[^.]{0,40}\b(?:production|manufacturing|capacity)\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Suspends Service / Product',
      pat:[/\b(?:suspend(?:s|ed|ing|sion)?|halt(?:s|ed|ing)?|stop(?:s|ped|ping)?)\b[^.]{0,40}\b(?:service[sd]?|product(?:ion)?|operation[sd]?)\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Expects Project Delivery By',
      pat:[/\b(?:deliver(?:y|ed|ing)?|completion|handover)\b[^.]{0,40}\b(?:by|in)\b[^.]{0,20}\b(?:Q[1-4]|\d{4})\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Offers Product / Service Of',
      pat:[/\b(?:offer(?:s|ed|ing)?|provid(?:es?|ed|ing)|deliver(?:s|ed|ing)?)\b[^.]{0,40}\b(?:product[sd]?|service[sd]?|solution[sd]?)\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Introduces Brand / Product In',
      pat:[/\b(?:introduc(?:es?|ed|ing,tion)|launch(?:es?|ed|ing)?)\b[^.]{0,40}\b(?:brand[sd]?|product[sd]?|new\s+(?:range|line))\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Launches Next Phase Of',
      pat:[/\blaunch(?:es?|ed|ing)?\b[^.]{0,40}\b(?:next|second|third|phase|stage)\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Upgrades Product / Service To',
      pat:[/\b(?:upgrad(?:es?|ed|ing)|enhanc(?:es?|ed|ing)|improv(?:es?|ed|ing))\b[^.]{0,40}\b(?:product[sd]?|service[sd]?|platform|system)\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Plans Store Expansion Of',
      pat:[/\b(?:store|outlet|branch|shop)\b[^.]{0,40}\b(?:expan(?:d|sion|ding)|open(?:ing|s|ed)?|rollout)\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Imports / Exports Products From / To',
      pat:[/\b(?:import(?:s|ed|ing|er[sd]?)?|export(?:s|ed|ing|er[sd]?)?)\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Outsourcing Agreement',
      pat:[/\b(?:outsourc(?:es?|ed|ing)|offshoring)\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'OEM / White-Label For',
      pat:[/\bOEM\b/g, /\bwhite.?label(?:led|ling)?\b/gi,
           /\boriginal\s+equipment\s+manufacturer\b/gi] },
    { cat:'Commercial', color:'#d68910', label:'Product / Service Price Increase Due To',
      pat:[/\bprice\b[^.]{0,40}\b(?:increas(?:es?|ed|ing)|hike[sd]?|rais(?:es?|ed|ing)|adjust(?:ment)?)\b/gi] },

    // ── Expansion and Operational ─────────────────────────────────────────
    { cat:'Expansion', color:'#27ae60', label:'International Expansion To',
      pat:[/\b(?:international|overseas?|global|cross.border)\b[^.]{0,40}\b(?:expan(?:d|sion|ding)|enter(?:ing|ed|s)?|penetrat(?:es?|ed|ing))\b/gi,
           /\bexpan(?:d|sion|ding)\b[^.]{0,40}\b(?:international|overseas?|abroad)\b/gi] },
    { cat:'Expansion', color:'#27ae60', label:'Receives Investment From',
      pat:[/\b(?:receiv(?:es?|ed|ing)|attract(?:s|ed|ing)?|secur(?:es?|ed|ing))\b[^.]{0,40}\b(?:investment[sd]?|funding|capital|backing)\b/gi] },
    { cat:'Expansion', color:'#27ae60', label:'Has Cornerstone Investor(s)',
      pat:[/\bcornerstone\s+investor[sd]?\b/gi] },
    { cat:'Expansion', color:'#27ae60', label:'Co-Invests With',
      pat:[/\bco.?invest(?:s|ed|ing|ment|or[sd]?)?\b/gi, /\bjointly\s+invest(?:s|ed|ing)?\b/gi] },
    { cat:'Expansion', color:'#27ae60', label:'Licensing Out',
      pat:[/\blicens(?:es?|ed|ing|or|out)\b/gi, /\broyalt(?:y|ies)\b/gi] },
    { cat:'Expansion', color:'#27ae60', label:'Franchise With',
      pat:[/\bfranchis(?:es?|ed|ing|or|ee)\b/gi] },
    { cat:'Expansion', color:'#27ae60', label:'Commits Capex Budget To',
      pat:[/\b(?:capex|capital\s+expenditure[sd]?|capital\s+spending)\b/gi] },
    { cat:'Expansion', color:'#27ae60', label:'Suffers From Underinvestment Due To',
      pat:[/\bunderinvest(?:ment|ed|ing)?\b/gi] },
    { cat:'Expansion', color:'#27ae60', label:'Has Strategic Partnership / MOU With',
      pat:[/\b(?:strategic\s+)?(?:partnership|collaboration|alliance)\b/gi,
           /\bMOU\b/g, /\bmemorandum\s+of\s+understanding\b/gi,
           /\bhead[sd]?\s+of\s+agreement\b/gi] },
    { cat:'Expansion', color:'#27ae60', label:'Concession / PPP With',
      pat:[/\bconcession(?:aire)?\b/gi, /\bPPP\b/g,
           /\bpublic.private\s+partnership\b/gi, /\bBOT\b/g, /\bBOO\b/g] },
    { cat:'Expansion', color:'#27ae60', label:'Forms Joint Venture With',
      pat:[/\bjoint\s+venture[sd]?\b/gi, /\bJV\b/g, /\bco.?venture\b/gi] },
    { cat:'Expansion', color:'#27ae60', label:'Leads Consortium For',
      pat:[/\bconsortium\b/gi, /\bleads?\b[^.]{0,40}\bconsortium\b/gi] },
    { cat:'Expansion', color:'#27ae60', label:'Acts as Special Purpose Vehicle For',
      pat:[/\bspecial\s+purpose\s+(?:vehicle|entity|company)\b/gi,
           /\bSPV\b/g, /\bSPC\b/g] },

    // ── Asset Management and Operations ───────────────────────────────────
    { cat:'Asset Management', color:'#16a085', label:'Acquire / Dispose Land',
      pat:[/\b(?:acquir(?:es?|ed|ing)|purchas(?:es?|ed|ing)|bought?)\b[^.]{0,40}\b(?:land|plot|parcel|acreage|hectare|property)\b/gi,
           /\b(?:sold?|dispos(?:es?|ed|ing|al)|divest(?:ed|ing|s)?)\b[^.]{0,40}\b(?:land|plot|parcel|property)\b/gi] },
    { cat:'Asset Management', color:'#16a085', label:'Lease From',
      pat:[/\b(?:leas(?:es?|ed|ing)|tenancy|rental)\b[^.]{0,40}\bfrom\b/gi,
           /\btenanted?\b/gi, /\bhead\s+lease\b/gi] },
    { cat:'Asset Management', color:'#16a085', label:'Lease To',
      pat:[/\b(?:leas(?:es?|ed|ing)|renting?\s+out|sub.?leas(?:es?|ed|ing))\b[^.]{0,40}\bto\b/gi,
           /\btenant[sd]?\b/gi] },
    { cat:'Asset Management', color:'#16a085', label:'Relocates Infrastructure Assets To',
      pat:[/\b(?:relocat(?:es?|ed|ing)|mov(?:es?|ed|ing))\b[^.]{0,40}\b(?:asset[sd]?|infrastructure|facilities)\b/gi] },
    { cat:'Asset Management', color:'#16a085', label:'Converts Asset Into',
      pat:[/\bconvert(?:s|ed|ing)?\b[^.]{0,40}\b(?:asset[sd]?|propert(?:y|ies))\b/gi,
           /\bconversion\b[^.]{0,40}\b(?:asset|property|building)\b/gi] },
    { cat:'Asset Management', color:'#16a085', label:'Establishes New Business',
      pat:[/\b(?:establish(?:es?|ed|ing)?|incorporat(?:es?|ed|ing,ion)|set(?:ting)?\s+up|found(?:ed?|ing)?)\b[^.]{0,40}\b(?:new\s+)?(?:business|company|subsidiar(?:y|ies)|unit|division)\b/gi] },
    { cat:'Asset Management', color:'#16a085', label:'Changes Name To',
      pat:[/\b(?:renam(?:es?|ed|ing)|changed?\s+(?:its\s+)?name\s+to|rebrand(?:ed|ing|s)?)\b/gi] },
    { cat:'Asset Management', color:'#16a085', label:'Changes Financial Year-End To',
      pat:[/\b(?:changed?|shift(?:s|ed|ing)?|mov(?:es?|ed|ing))\b[^.]{0,40}\bfinancial\s+year.?end\b/gi] },
    { cat:'Asset Management', color:'#16a085', label:'Strengthens Internal Controls Through',
      pat:[/\binternal\s+controls?\b[^.]{0,40}\b(?:strengthen(?:ed|s|ing)?|improv(?:es?|ed|ing)|enhanc(?:es?|ed|ing))\b/gi] },
    { cat:'Asset Management', color:'#16a085', label:'Operationally Disrupted By',
      pat:[/\b(?:disrupt(?:s|ed|ing|ion)?|operat(?:ional)?\s+(?:challeng|issue|problem))\b/gi] },
    { cat:'Asset Management', color:'#16a085', label:'Blames For Operational Incident',
      pat:[/\bblam(?:es?|ed|ing)\b[^.]{0,40}\b(?:incident|accident|outage|failure)\b/gi] },

    // ── Regulatory, Legal and Compliance ──────────────────────────────────
    { cat:'Regulatory', color:'#c0392b', label:'Applies for License From',
      pat:[/\bappli(?:es?|ed|cation)\s+(?:for|to)\b[^.]{0,40}\blicens(?:es?|ing)\b/gi,
           /\blicens(?:es?|ing)\s+appli(?:es?|ed|cation)\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Receives Regulatory Approval From',
      pat:[/\b(?:regulat(?:ory\s+)?approv(?:al|es?)|government\s+approv(?:al|es?))\b/gi,
           /\bapprov(?:al|es?|ed)\b[^.]{0,40}\b(?:regulator|authority|SC|BNM|SEC|FCA|MAS)\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Has License Of',
      pat:[/\b(?:hold(?:s|ing)?|possess(?:es?|ed|ing)?|own(?:s|ed|ing)?)\b[^.]{0,40}\blicens(?:es?|ed)\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Reviews Policy On',
      pat:[/\breview(?:s|ed|ing)?\b[^.]{0,40}\bpolic(?:y|ies)\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Investigated By',
      pat:[/\b(?:investigat(?:es?|ed|ing|ion)|probe[sd]?|inquir(?:y|ies)|scrutinis(?:es?|ed|ing))\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Sanctioned By',
      pat:[/\bsanction(?:s|ed|ing)?\b/gi, /\bblacklist(?:s|ed|ing)?\b/gi,
           /\bbarred?\s+from\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Fined By',
      pat:[/\b(?:fin(?:es?|ed|ing)|penalt(?:y|ies)|penalis(?:es?|ed|ing)|penaliz(?:es?|ed|ing))\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Suspended from Trading By',
      pat:[/\b(?:suspend(?:s|ed|ing|sion)?)\b[^.]{0,40}\btrading\b/gi,
           /\btrading\b[^.]{0,40}\b(?:halt|suspend(?:ed|s|ion)|PN1\d)\b/gi,
           /\btrading\s+halt\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Receives Official Complaint From',
      pat:[/\b(?:complaint[sd]?|grievance[sd]?)\b[^.]{0,40}\b(?:receiv(?:es?|ed|ing)|filed?|lodged?)\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Faces Potential Penalty From',
      pat:[/\bfaces?\b[^.]{0,40}\b(?:potential\s+)?(?:penalty|penalt(?:y|ies)|fine[sd]?)\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Litigation With',
      pat:[/\b(?:litigation|lawsuit[sd]?|legal\s+(?:action|proceeding|suit|battle))\b/gi,
           /\bsued?\s+(?:by|for)\b/gi, /\bwrit\s+of\s+summons\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Settlement With',
      pat:[/\bsettl(?:es?|ed|ing|ement[sd]?)\b[^.]{0,40}\b(?:case|claim|suit|dispute)\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Claim With',
      pat:[/\bclaim(?:s|ed|ing)?\b[^.]{0,40}\b(?:damages?|compensation|relief|sum)\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Initiates Arbitration Proceedings Against',
      pat:[/\barbitrat(?:ion|es?|ed|ing)\b/gi, /\bICC\s+arbitration\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Legally Impacted By',
      pat:[/\blegally\b[^.]{0,20}\b(?:impact(?:ed)?|bound|required|obligated)\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Allegedly Linked To',
      pat:[/\balleg(?:es?|ed|edly|ation)\b/gi, /\baccused?\s+of\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Collects Compensation From',
      pat:[/\b(?:compensat(?:ion|es?|ed|ing)|damages?)\b[^.]{0,40}\b(?:collect(?:ed|ing|s)?|receiv(?:es?|ed|ing))\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Pays Legal Costs To',
      pat:[/\bpay(?:s|ing|ment)?\s+(?:legal\s+)?costs?\b/gi,
           /\blegal\s+costs?\b[^.]{0,40}\bpaid?\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Pays Tax To',
      pat:[/\b(?:tax(?:es?|ation|ed)?|GST|SST|withholding\s+tax|income\s+tax|corporate\s+tax)\b/gi] },
    { cat:'Regulatory', color:'#c0392b', label:'Discloses Regulatory Risk Regarding',
      pat:[/\bregulatory\s+risk\b/gi, /\bcompli(?:es?|ed|ing|ance)\s+risk\b/gi] },

    // ── Technology and IP ─────────────────────────────────────────────────
    { cat:'Technology', color:'#8e44ad', label:'Technology Integration',
      pat:[/\btechnolog(?:y|ies)\b[^.]{0,40}\b(?:integrat(?:es?|ed|ing,ion)|adopt(?:s|ed|ing,ion)?|implement(?:s|ed|ing))\b/gi] },
    { cat:'Technology', color:'#8e44ad', label:'IP Acquisition From',
      pat:[/\b(?:IP|intellectual\s+propert(?:y|ies)|patent[sd]?|trademark[sd]?|copyright[sd]?)\b[^.]{0,40}\b(?:acquir(?:es?|ed|ing)|purchas(?:es?|ed|ing)|licens(?:es?|ed|ing))\b/gi] },
    { cat:'Technology', color:'#8e44ad', label:'Sells IP / Technology To',
      pat:[/\b(?:sold?|transfer(?:s|red|ring)?)\b[^.]{0,40}\b(?:IP|patent|technology|know.how)\b/gi] },
    { cat:'Technology', color:'#8e44ad', label:'Adopts Technology Of',
      pat:[/\b(?:adopt(?:s|ed|ing)|implement(?:s|ed|ing)|deploy(?:s|ed|ing))\b[^.]{0,40}\b(?:AI|technology|platform|system|solution)\b/gi] },
    { cat:'Technology', color:'#8e44ad', label:'Transfers Technology To',
      pat:[/\btechnology\s+transfer\b/gi, /\btransfer(?:s|red|ring)?\b[^.]{0,40}\btechnology\b/gi] },
    { cat:'Technology', color:'#8e44ad', label:'Substitutes Technology With',
      pat:[/\bsubstitut(?:es?|ed|ing)\b[^.]{0,40}\btechnology\b/gi,
           /\breplace(?:s|d|ment)?\b[^.]{0,40}\b(?:technology|system|platform)\b/gi] },
    { cat:'Technology', color:'#8e44ad', label:'Impacted by Technology Failure Of',
      pat:[/\btechnology\s+failure\b/gi, /\bsystem\s+(?:outage|failure|crash|downtime)\b/gi] },
    { cat:'Technology', color:'#8e44ad', label:'Cyber Incident Involving',
      pat:[/\b(?:cyber(?:.?attack)?|data\s+breach|ransomware|hack(?:s|ed|ing)?|phishing|DDoS|malware)\b/gi] },
    { cat:'Technology', color:'#8e44ad', label:'SaaS Subscription With',
      pat:[/\bSaaS\b/gi, /\bsoftware.as.a.service\b/gi, /\bsubscription.?based?\b/gi] },
    { cat:'Technology', color:'#8e44ad', label:'Data Sharing With',
      pat:[/\bdata.?shar(?:ing|es?)\b/gi, /\bdata\s+(?:partnership|agreement|exchange|collaboration)\b/gi] },
    { cat:'Technology', color:'#8e44ad', label:'Co-Development / R&D',
      pat:[/\bco.?develop(?:ment|ed|ing)?\b/gi, /\bR&D\b/gi,
           /\bresearch\s+(?:and|&)\s+development\b/gi, /\bjoint\s+research\b/gi] },
    { cat:'Technology', color:'#8e44ad', label:'Project Development With',
      pat:[/\bproject\s+development\b/gi, /\bjointly\s+develop(?:s|ed|ing)?\b/gi] },

    // ── Governance and Management ─────────────────────────────────────────
    { cat:'Governance', color:'#2980b9', label:'Appoints As',
      pat:[/\b(?:appoint(?:s|ed|ing,ment)?)\b[^.]{0,60}\b(?:CEO|CFO|COO|CTO|chairman|director|officer|president|managing\s+director|MD|executive|group\s+chief)\b/gi] },
    { cat:'Governance', color:'#2980b9', label:'Appoints Director / Officer',
      pat:[/\b(?:appoint(?:s|ed|ing,ment)?)\b[^.]{0,40}\b(?:director|board|officer|member)\b/gi,
           /\b(?:new|independent|executive)\b[^.]{0,20}\b(?:director|chairman)\b/gi] },
    { cat:'Governance', color:'#2980b9', label:'Hires Talent With Expertise In',
      pat:[/\b(?:hir(?:es?|ed|ing)|recruit(?:s|ed|ing,ment)?|onboard(?:s|ed|ing)?)\b/gi] },
    { cat:'Governance', color:'#2980b9', label:'Director Resigns',
      pat:[/\b(?:resign(?:s|ed|ing,ation)?|step(?:s|ped|ping)\s+down|retir(?:es?|ed|ing))\b[^.]{0,40}\b(?:director|executive|officer|board|chairman)\b/gi,
           /\b(?:director|executive)\b[^.]{0,40}\b(?:resign(?:s|ed|ing,ation)?|step(?:s|ped|ping)\s+down)\b/gi] },
    { cat:'Governance', color:'#2980b9', label:'Resumes Role In',
      pat:[/\bresum(?:es?|ed|ing)\b[^.]{0,40}\b(?:role|position|duty|duties|post)\b/gi] },
    { cat:'Governance', color:'#2980b9', label:'Declares Vacancy Of',
      pat:[/\b(?:vacancy|vacant|vacated?)\b/gi] },
    { cat:'Governance', color:'#2980b9', label:'Position Held',
      pat:[/\b(?:held?\s+(?:the\s+)?position|serv(?:es?|ed|ing)\s+as|act(?:s|ed|ing)\s+as)\b/gi] },
    { cat:'Governance', color:'#2980b9', label:'Affects Employment Ecosystem In',
      pat:[/\b(?:employment|workforce|headcount|staff(?:ing)?)\b[^.]{0,40}\b(?:affect(?:s|ed|ing)?|impact(?:s|ed|ing)?)\b/gi] },

    // ── ESG and Social Impact ─────────────────────────────────────────────
    { cat:'ESG', color:'#229954', label:'Restores Ecosystems Through',
      pat:[/\b(?:restor(?:es?|ed|ing|ation))\b[^.]{0,40}\b(?:ecosystem|environment|habitat|forest|wetland)\b/gi] },
    { cat:'ESG', color:'#229954', label:'Plants Trees In',
      pat:[/\b(?:plant(?:s|ed|ing)?|tree\s+planting)\b[^.]{0,40}\b(?:tree[sd]?|forest|seedling)\b/gi] },
    { cat:'ESG', color:'#229954', label:'Carbon Credit Trade With',
      pat:[/\bcarbon\s+(?:credit[sd]?|offset[sd]?|trading)\b/gi,
           /\bvoluntary\s+carbon\b/gi] },
    { cat:'ESG', color:'#229954', label:'Achieves Carbon Avoidance Of',
      pat:[/\bcarbon\s+(?:avoidance|neutral(?:ity)?|zero|reduction|footprint)\b/gi,
           /\bnet.?zero\b/gi, /\bGHG\s+(?:emission|reduction)\b/gi] },
    { cat:'ESG', color:'#229954', label:'Secures Green Electricity Under',
      pat:[/\bgreen\s+electricity\b/gi, /\brenewable\s+energy\b/gi,
           /\bsolar\b[^.]{0,20}\b(?:power|energy|panel|farm)\b/gi,
           /\bPPA\b/g, /\bpower\s+purchase\s+agreement\b/gi,
           /\bgreen\s+hydrogen\b/gi] },
    { cat:'ESG', color:'#229954', label:'Strengthens Renewable Energy Infrastructure In',
      pat:[/\brenewable\b[^.]{0,40}\binfrastructure\b/gi,
           /\bgreen\s+infrastructure\b/gi] },
    { cat:'ESG', color:'#229954', label:'Donation To / From',
      pat:[/\b(?:donat(?:ion|es?|ed|ing)|philanthrop(?:y|ic)|charit(?:y|ies,able)|CSR\s+(?:fund|donation))\b/gi] },
    { cat:'ESG', color:'#229954', label:'Has NGO Partnership With',
      pat:[/\bNGO\b/gi, /\bnon.?governmental\s+organisation\b/gi] },
    { cat:'ESG', color:'#229954', label:'Receives ESG Rating From',
      pat:[/\bESG\b[^.]{0,40}\b(?:rating|score|assessment|index|metric)\b/gi,
           /\bsustainabilit(?:y|ies)\b[^.]{0,40}\b(?:rating|score|assessment|index)\b/gi,
           /\bMSCI\s+ESG\b/gi, /\bDJSI\b/gi] },
    { cat:'ESG', color:'#229954', label:'Cuts Workforce Due To',
      pat:[/\b(?:retrench(?:ment|ed|ing)?|redundanc(?:y|ies)|lay.?off[sd]?|workforce\s+(?:cut[sd]?|reduction|downsiz(?:ing|es?)))\b/gi] },

    // ── Financial Performance and Outlook ─────────────────────────────────
    { cat:'Financial Performance', color:'#d35400', label:'Generated Revenue Of',
      pat:[/\b(?:revenue[sd]?|turnover|sales?\s+revenue)\b[^.]{0,40}\b(?:of|totalling|reached?|stood?\s+at|hit)\b/gi,
           /\bgenerat(?:es?|ed|ing)\b[^.]{0,40}\brevenue[sd]?\b/gi] },
    { cat:'Financial Performance', color:'#d35400', label:'Posted Net Loss / Profit Of',
      pat:[/\bnet\s+(?:loss|profit|income|earnings?)\b/gi,
           /\bpre.?tax\s+(?:profit|loss)\b/gi,
           /\b(?:post(?:ed|s|ing)?|report(?:ed|s|ing)?)\b[^.]{0,40}\b(?:loss|profit|earnings?)\b/gi] },
    { cat:'Financial Performance', color:'#d35400', label:'Profit Margin Improved / Declined To',
      pat:[/\b(?:profit|gross|EBITDA|net|operating)\s+margin\b/gi] },
    { cat:'Financial Performance', color:'#d35400', label:'Expects Earnings Acceleration In',
      pat:[/\b(?:expect(?:s|ed|ing)?|forecast(?:s|ed|ing)?|project(?:s|ed|ing)?)\b[^.]{0,40}\b(?:earn(?:ing|ings?)|profit|income|growth)\b/gi] },
    { cat:'Financial Performance', color:'#d35400', label:'Expects to Generate Recurring Income Through',
      pat:[/\brecurring\s+(?:income|revenue|earnings?)\b/gi] },
    { cat:'Financial Performance', color:'#d35400', label:'Expects Capital Expenditure Of',
      pat:[/\bexpect(?:s|ed|ing)?\b[^.]{0,40}\b(?:capex|capital\s+expenditure)\b/gi] },
    { cat:'Financial Performance', color:'#d35400', label:'Expects Sales Decline In',
      pat:[/\b(?:expect(?:s|ed|ing)?|forecast(?:s|ed|ing)?)\b[^.]{0,40}\bsales?\s+(?:decline|decrease|drop|fall)\b/gi] },

    // ── Market Performance and Trading ────────────────────────────────────
    { cat:'Market Performance', color:'#7f8c8d', label:'Listed On / In',
      pat:[/\b(?:listed?|traded?)\b[^.]{0,40}\b(?:Bursa|NYSE|NASDAQ|SGX|HKEX|LSE|ASX|stock\s+exchange|main\s+market|ACE\s+market)\b/gi,
           /\b(?:main\s+board|main\s+market|second\s+board)\s+listing\b/gi] },
    { cat:'Market Performance', color:'#7f8c8d', label:'Plans IPO In',
      pat:[/\bIPO\b/g, /\binitial\s+public\s+offer(?:ing)?\b/gi,
           /\bflot(?:ation|es?)\b/gi, /\bgo(?:ing)?\s+public\b/gi] },
    { cat:'Market Performance', color:'#7f8c8d', label:'Received IPO Subscription From / In',
      pat:[/\bIPO\b[^.]{0,40}\bsubscrib(?:es?|ed|ing|tion)\b/gi,
           /\boversubscrib(?:es?|ed|ing)\b/gi] },
    { cat:'Market Performance', color:'#7f8c8d', label:'Delays / Cancels IPO Decision In',
      pat:[/\b(?:delay(?:s|ed|ing)?|cancel(?:s|led|ling,ation)?)\b[^.]{0,40}\bIPO\b/gi] },
    { cat:'Market Performance', color:'#7f8c8d', label:'Delisted From',
      pat:[/\bdelist(?:s|ed|ing)\b/gi, /\bremoved?\s+from\b[^.]{0,40}\bexchange\b/gi] },
    { cat:'Market Performance', color:'#7f8c8d', label:'Added / Removed as Constituent Of',
      pat:[/\b(?:added?|included?|removed?|excluded?)\b[^.]{0,40}\b(?:index|constituent|benchmark|MSCI|FTSE|S&P|KLCI|FBM)\b/gi] },

    // ── Share Price and Flow ──────────────────────────────────────────────
    { cat:'Share Price', color:'#95a5a6', label:'Shares Rise / Slip In',
      pat:[/\b(?:shares?|stocks?)\b[^.]{0,40}\b(?:ris(?:es?|ing)|fell?|slip(?:s|ped|ping)?|declin(?:es?|ing)|surged?|plunged?|jump(?:s|ed|ing)?|climb(?:s|ed|ing)?)\b/gi] },
    { cat:'Share Price', color:'#95a5a6', label:'Share Price Rises / Slips Due To',
      pat:[/\b(?:share|stock)\s+price\b/gi] },
    { cat:'Share Price', color:'#95a5a6', label:'Stock Led Declines / Rises On',
      pat:[/\bstock\b[^.]{0,30}\b(?:led?|top(?:s|ped)?)\b[^.]{0,20}\b(?:decline[sd]?|gain[sd]?|rise[sd]?|fall)\b/gi] },
    { cat:'Share Price', color:'#95a5a6', label:'Becomes Top Gainer / Loser In',
      pat:[/\b(?:top\s+(?:gainer|loser|performer)|biggest\s+(?:gainer|loser)|best.?performing)\b/gi] },
    { cat:'Share Price', color:'#95a5a6', label:'Experiences Price Limit Up / Down In',
      pat:[/\bprice\s+limit\b/gi, /\blupper\s+limit\b/gi, /\blower\s+limit\b/gi,
           /\bcircuit\s+breaker\b/gi] },
    { cat:'Share Price', color:'#95a5a6', label:'Experiences Net Capital Outflow / Inflow From',
      pat:[/\b(?:capital|fund)\s+(?:inflow|outflow|flight)\b/gi,
           /\bforeign\s+(?:buying|selling|inflow|outflow)\b/gi] },

    // ── Economic, External Influence and National Contribution ────────────
    { cat:'Economic', color:'#f39c12', label:'Impacted by Decision Of',
      pat:[/\bimpact(?:s|ed|ing)?\b[^.]{0,40}\b(?:decision|announcement|policy)\b/gi] },
    { cat:'Economic', color:'#f39c12', label:'Impacted by Subsidy Removal From',
      pat:[/\bsubsid(?:y|ies|ised?|izing?)\b/gi,
           /\bsubsidy\s+(?:removal|reform|rationalisation|phaseout)\b/gi] },
    { cat:'Economic', color:'#f39c12', label:'Impacted by Monetary Policy From',
      pat:[/\b(?:interest\s+rate[sd]?|monetary\s+policy|OPR|base\s+rate|rate\s+(?:hike|cut|decision))\b/gi] },
    { cat:'Economic', color:'#f39c12', label:'Macroeconomically Impacted By',
      pat:[/\b(?:macroeconom(?:ic|y)|GDP|inflation|deflation|recession|economic\s+(?:growth|slowdown|downturn|cycle))\b/gi] },
    { cat:'Economic', color:'#f39c12', label:'Microeconomically Impacted By',
      pat:[/\b(?:microeconom(?:ic|y)|demand|supply|competition|pricing\s+power)\b/gi] },
    { cat:'Economic', color:'#f39c12', label:'Receives Positive Demand Indication From',
      pat:[/\bdemand\b[^.]{0,40}\b(?:positive|strong|robust|healthy|buoyant|increase[sd]?)\b/gi] },
    { cat:'Economic', color:'#f39c12', label:'Outlook Projected By',
      pat:[/\b(?:outlook|forecast|projection)\b[^.]{0,40}\b(?:project(?:s|ed|ing)?|forecast(?:s|ed|ing)?|predict(?:s|ed|ing)?)\b/gi] },
    { cat:'Economic', color:'#f39c12', label:'Implements Policy / Strategy Of',
      pat:[/\b(?:polic(?:y|ies)|strateg(?:y|ies))\b[^.]{0,40}\b(?:implement(?:s|ed|ing)?|launch(?:es?|ed|ing)?|adopt(?:s|ed|ing)?)\b/gi] },
    { cat:'Economic', color:'#f39c12', label:'Fiscally Impacted By',
      pat:[/\bfiscal\b[^.]{0,20}\b(?:impact|policy|deficit|surplus|budget)\b/gi] },
    { cat:'Economic', color:'#f39c12', label:'Declares Currency Misalignment Against',
      pat:[/\b(?:currency|exchange\s+rate|forex|FX)\b[^.]{0,40}\b(?:misalign(?:ment)?|manipulat(?:ion|ed)|weak(?:en|ness)?|depreciat(?:ed|ion))\b/gi] },
    { cat:'Economic', color:'#f39c12', label:'Expects Net Interest Margin In',
      pat:[/\bnet\s+interest\s+margin\b/gi, /\bNIM\b/g] },
    { cat:'Economic', color:'#f39c12', label:'Expects OPR / Interest Rate Of',
      pat:[/\bOPR\b/g, /\bovernight\s+policy\s+rate\b/gi,
           /\binterest\s+rate\b[^.]{0,40}\b(?:expect(?:s|ed|ing)?|forecast(?:s|ed|ing)?)\b/gi] },

    // ── Industry / Strategic Positioning ─────────────────────────────────
    { cat:'Industry', color:'#2c3e50', label:'Principally Engages In',
      pat:[/\b(?:principally|primarily|mainly|predominantly)\b[^.]{0,40}\b(?:engag(?:es?|ed|ing)|operat(?:es?|ed|ing)|involv(?:es?|ed|ing))\b/gi] },
    { cat:'Industry', color:'#2c3e50', label:'Key Player In',
      pat:[/\b(?:key|major|leading|dominant|prominent)\s+(?:player|participant|stakeholder)\b/gi] },
    { cat:'Industry', color:'#2c3e50', label:'Has Competitive Relationship With',
      pat:[/\b(?:compet(?:es?|ed|ing,itor[sd]?,ition)|rival(?:s|led|ling)?)\b/gi] },
    { cat:'Industry', color:'#2c3e50', label:'Remains Pricing Competitive In',
      pat:[/\bpricing\s+(?:competiti(?:ve|on)|pressure|strategy)\b/gi] },
    { cat:'Industry', color:'#2c3e50', label:'Reduces Dependence On',
      pat:[/\b(?:reduc(?:es?|ed|ing)|lower(?:s|ed|ing)?)\b[^.]{0,40}\b(?:dependence|reliance|exposure)\b/gi] },
    { cat:'Industry', color:'#2c3e50', label:'Publicly Recognised / Awarded By',
      pat:[/\b(?:award(?:ed|s|ing)?|recognis(?:es?|ed|ing,ition)|honour(?:ed|s|ing)?|certif(?:ied|y,ication))\b/gi] },
    { cat:'Industry', color:'#2c3e50', label:'Ranks Among Top Performers In',
      pat:[/\b(?:rank(?:s|ed|ing)?|rank(?:ed)?\s+among|top\s+\d+|best.?in.?class|leader\s+in)\b/gi] },
    { cat:'Industry', color:'#2c3e50', label:'Becomes First Entity In',
      pat:[/\b(?:first|pioneer|inaugural)\b[^.]{0,40}\b(?:in\s+(?:Malaysia|Asia|ASEAN|the\s+region)|to\s+(?:achieve|launch|list))\b/gi] },

    // ── Investment (Fund) ─────────────────────────────────────────────────
    { cat:'Investment Fund', color:'#1a5276', label:'Fund / Portfolio Diversifies',
      pat:[/\b(?:fund|portfolio)\b[^.]{0,40}\b(?:diversif(?:ies|ied|ication)|rebalanc(?:es?|ed|ing))\b/gi] },
    { cat:'Investment Fund', color:'#1a5276', label:'Hedging / Derivative With',
      pat:[/\b(?:hedg(?:es?|ed|ing)|derivative[sd]?|swap[sd]?|option[sd]?|forward[sd]?|futures?)\b/gi] },
    { cat:'Investment Fund', color:'#1a5276', label:'Establishes Trust Account With',
      pat:[/\b(?:trust\s+account|escrow)\b/gi] },
    { cat:'Investment Fund', color:'#1a5276', label:'Administers Estates For',
      pat:[/\b(?:administer(?:s|ed|ing)?|manage(?:s|d|ment)?)\b[^.]{0,40}\bestate[sd]?\b/gi] },

    // ── Government ────────────────────────────────────────────────────────
    { cat:'Government', color:'#154360', label:'Grant / Incentive From',
      pat:[/\b(?:grant[sd]?|incentive[sd]?|exemption[sd]?|tax\s+(?:break|relief|rebate|holiday)|subsid(?:y|ies))\b[^.]{0,40}\b(?:government|ministry|agency|authority)\b/gi,
           /\b(?:government|ministry)\b[^.]{0,40}\b(?:grant[sd]?|incentive[sd]?|subsid(?:y|ies))\b/gi] },
    { cat:'Government', color:'#154360', label:'Builds Loan Approval Pipeline In',
      pat:[/\bloan\s+approval\s+pipeline\b/gi, /\bmortgage\s+pipeline\b/gi] },
    { cat:'Government', color:'#154360', label:'Builds Defence Assets For',
      pat:[/\b(?:defence|defense|military|armed\s+forces?)\b[^.]{0,40}\b(?:asset[sd]?|vessel[sd]?|equipment[sd]?|platform[sd]?|ship[sd]?|aircraft)\b/gi] },
    { cat:'Government', color:'#154360', label:'Supplies Military Capability To',
      pat:[/\b(?:military|defence)\b[^.]{0,40}\bcapabilit(?:y|ies)\b/gi] },
    { cat:'Government', color:'#154360', label:'Develops Data Centres In',
      pat:[/\bdata\s+cent(?:re|er)[sd]?\b/gi, /\bcloud\s+infrastructure\b/gi] },
    { cat:'Government', color:'#154360', label:'Collaborates With Government In',
      pat:[/\b(?:collaborat(?:es?|ed|ing,ion)|partner(?:ing|ed|ship)?|cooperat(?:es?|ed|ing,ion))\b[^.]{0,40}\b(?:government|ministry|public\s+sector)\b/gi] },

    // ── Communication and Public Action ───────────────────────────────────
    { cat:'Communication', color:'#808b96', label:'Makes Public Statement Of',
      pat:[/\b(?:announc(?:es?|ed|ing,ement)|stat(?:es?|ed|ing,ement)|declar(?:es?|ed|ing,ation)|said|says|stated|confirmed?)\b/gi] },
    { cat:'Communication', color:'#808b96', label:'Reports News Of',
      pat:[/\b(?:report(?:s|ed|ing)?|disclosed?|revealed?)\b/gi] },
    { cat:'Communication', color:'#808b96', label:'Has Discussion With',
      pat:[/\b(?:discuss(?:ion[sd]?|es?|ed|ing)|negotiat(?:ion[sd]?|es?|ed|ing)|dialogue[sd]?|talk(?:s|ed|ing)?)\b/gi] },
    { cat:'Communication', color:'#808b96', label:'Hosts / Organises',
      pat:[/\b(?:host(?:s|ed|ing)?|organis(?:es?|ed|ing)|organiz(?:es?|ed|ing)|conven(?:es?|ed|ing))\b/gi] },
    { cat:'Communication', color:'#808b96', label:'Invites',
      pat:[/\binvit(?:es?|ed|ing|ation)\b/gi] },

    // ── Others ────────────────────────────────────────────────────────────
    { cat:'Others', color:'#717d7e', label:'Discloses Order Book Breakdown Of',
      pat:[/\border\s+book\b/gi] },
    { cat:'Others', color:'#717d7e', label:'Related Party Transaction',
      pat:[/\brelated.?party\b[^.]{0,40}\b(?:transaction[sd]?|dealing[sd]?)\b/gi, /\bRPT\b/g] },
    { cat:'Others', color:'#717d7e', label:'Insurance Placement With',
      pat:[/\b(?:insurance|re.?insurance)\b[^.]{0,40}\b(?:placement|coverage|policy|cover)\b/gi] },
    { cat:'Others', color:'#717d7e', label:'Receives Research Coverage From',
      pat:[/\banalyst\b[^.]{0,40}\b(?:report|coverage|note|initiat(?:es?|ed|ing)\s+coverage)\b/gi] },
    { cat:'Others', color:'#717d7e', label:'Receives Overweight / Underweight Call From',
      pat:[/\b(?:overweight|underweight|outperform|underperform|strong\s+buy|buy|sell|hold)\b[^.]{0,30}\b(?:rating|call|recommendation|target\s+price)\b/gi] },
    { cat:'Others', color:'#717d7e', label:'Forecasts M&A Activities In',
      pat:[/\bforecast(?:s|ed|ing)?\b[^.]{0,40}\b(?:M&A|merger|acquisition|deal)\b/gi] },
    { cat:'Others', color:'#717d7e', label:'Tender Participation For',
      pat:[/\b(?:tender(?:ed|s|ing)?|bid(?:s|ding)?)\b[^.]{0,40}\b(?:for|on|participate|participation)\b/gi] },
    { cat:'Others', color:'#717d7e', label:'Withdraws Bid For',
      pat:[/\b(?:withdraw(?:s|n|ing)?|pull(?:s|ed|ing)?\s+out)\b[^.]{0,40}\bbid\b/gi] },
    { cat:'Others', color:'#717d7e', label:'Provides Benefits To',
      pat:[/\b(?:benefit[sd]?|advantage[sd]?|perk[sd]?)\b[^.]{0,40}\b(?:provid(?:es?|ed|ing)|offer(?:s|ed|ing)?)\b/gi] },
    { cat:'Others', color:'#717d7e', label:'Is Shortlisted For',
      pat:[/\bshortlist(?:s|ed|ing)?\b/gi, /\bshort.?listed\b/gi] },
  ];


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
      .ner-bm-badge{background:#3d5af1;color:#fff;border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700}
      .ner-bm-toggle{color:#667;font-size:14px;transition:transform .2s}
      #ner-bm-panel:not(.collapsed) .ner-bm-toggle{transform:rotate(180deg)}
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
      .ner-bm-rel-row{display:flex;align-items:center;gap:5px;padding:4px 2px;border-bottom:1px solid #1e1e3a;
        font-size:11px;cursor:pointer;flex-wrap:wrap}
      .ner-bm-rel-row:hover{background:#1e1e3a;border-radius:4px;padding:4px 6px;margin:0 -4px}
      .ner-bm-rel-entity{padding:2px 6px;border-radius:3px;font-weight:600;white-space:nowrap;
        overflow:hidden;text-overflow:ellipsis;max-width:130px}
      .ner-bm-rel-label{color:#fff;font-size:9px;background:#2a2a4a;border-radius:3px;
        padding:2px 5px;white-space:nowrap;flex-shrink:0;border:1px solid transparent}
      .ner-bm-rel-arrow{color:#445;flex-shrink:0;font-size:10px}
      .ner-bm-cat-header{font-size:10px;color:#445;font-weight:700;text-transform:uppercase;
        letter-spacing:.8px;padding:8px 0 2px;border-bottom:1px solid #1e1e3a;margin-bottom:4px}
    `;
    document.head.appendChild(style);
  }

  /* ── relation detection (text-phrase based) ── */
  let allRelations = [];

  function markOffsetInBlock(block, mark) {
    try {
      const r = document.createRange();
      r.selectNodeContents(block);
      r.setEnd(mark, 0);
      return r.toString().length;
    } catch (e) { return 0; }
  }

  function findRelations() {
    const BLOCK_SEL = 'p,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,figcaption';
    const rels = [];
    const seen = new Set();
    const WIN = 260; // max char distance from keyword to entity

    document.querySelectorAll(BLOCK_SEL).forEach(block => {
      // Skip blocks that contain nested blocks (prevents double-counting)
      if (block.querySelector('p,li,blockquote')) return;
      const marks = Array.from(block.querySelectorAll('mark.ner-bm-label'));
      if (marks.length < 2) return;

      const blockText = block.textContent;
      if (blockText.trim().length < 5) return;

      // Compute character offsets for all marks (one Range pass per mark)
      const markData = marks.map(mark => {
        const offset = markOffsetInBlock(block, mark);
        return { mark, offset, end: offset + mark.textContent.length };
      });

      RELATION_CATALOG.forEach(relDef => {
        relDef.pat.forEach(basePat => {
          // Rebuild with global flag to allow exec loop
          const pat = new RegExp(basePat.source, 'gi');
          let m;
          while ((m = pat.exec(blockText)) !== null) {
            const mStart = m.index, mEnd = m.index + m[0].length;

            // Find nearest mark ending before match (subject)
            let before = null, bestBefore = -1;
            // Find nearest mark starting after match (object)
            let after = null, bestAfter = Infinity;

            markData.forEach(md => {
              if (md.end <= mStart && md.end > bestBefore) {
                const dist = mStart - md.end;
                if (dist < WIN) { bestBefore = md.end; before = md; }
              }
              if (md.offset >= mEnd && md.offset < bestAfter) {
                const dist = md.offset - mEnd;
                if (dist < WIN) { bestAfter = md.offset; after = md; }
              }
            });

            if (!before || !after || before === after) continue;
            if (before.end > after.offset) continue; // overlap guard

            const pairId = `${before.mark.textContent.trim()}|${after.mark.textContent.trim()}|${relDef.label}`;
            if (seen.has(pairId)) continue;
            seen.add(pairId);

            rels.push({
              from: before.mark, to: after.mark,
              label: relDef.label, category: relDef.cat, color: relDef.color,
              fromType: before.mark.dataset.entity, toType: after.mark.dataset.entity,
            });
          }
        });
      });
    });
    return rels;
  }

  /* ── SVG overlay ── */
  let linesVisible = false;
  let drawPending = false;

  function getSVG() {
    let svg = document.getElementById('ner-bm-svg');
    if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'ner-bm-svg'; document.documentElement.appendChild(svg); }
    return svg;
  }

  function drawRelationLines() {
    const svg = getSVG();
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!linesVisible || !allRelations.length) return;

    const vh = window.innerHeight;

    // Sort by arc length and cap at 25 visible arcs to avoid clutter
    const visible = allRelations
      .map(rel => {
        const ra = rel.from.getBoundingClientRect(), rb = rel.to.getBoundingClientRect();
        const dx = rb.left - ra.left, dy = rb.top - ra.top;
        return { rel, ra, rb, dist: Math.sqrt(dx*dx + dy*dy),
                 inView: !(ra.bottom < -20 || ra.top > vh + 20 || rb.bottom < -20 || rb.top > vh + 20) };
      })
      .filter(d => d.inView)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 25);

    visible.forEach(({ rel, ra, rb }) => {
      const ax = ra.left + ra.width / 2, ay = ra.top + ra.height / 2;
      const bx = rb.left + rb.width / 2, by = rb.top + rb.height / 2;
      const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
      const bow = Math.max(20, Math.min(65, dx * 0.28 + dy * 0.12));
      const mx = (ax + bx) / 2, my = Math.min(ay, by) - bow;

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

      // arc
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${ax},${ay} Q${mx},${my} ${bx},${by}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', rel.color);
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('stroke-opacity', '0.6');
      path.setAttribute('stroke-dasharray', '5 3');
      g.appendChild(path);

      // arrowhead at destination
      const t = 0.94;
      const qx = (1-t)*(1-t)*ax + 2*(1-t)*t*mx + t*t*bx;
      const qy = (1-t)*(1-t)*ay + 2*(1-t)*t*my + t*t*by;
      const angle = Math.atan2(by - qy, bx - qx) * 180 / Math.PI;
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      arrow.setAttribute('points', '0,-3.5 7,0 0,3.5');
      arrow.setAttribute('fill', rel.color);
      arrow.setAttribute('opacity', '0.7');
      arrow.setAttribute('transform', `translate(${bx},${by}) rotate(${angle})`);
      g.appendChild(arrow);

      // label background + text
      const label = rel.label.length > 28 ? rel.label.slice(0, 26) + '…' : rel.label;
      const lw = label.length * 5.2 + 10;
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('x', mx - lw / 2); bg.setAttribute('y', my - 12);
      bg.setAttribute('width', lw); bg.setAttribute('height', 13);
      bg.setAttribute('rx', '3'); bg.setAttribute('fill', '#1a1a2e'); bg.setAttribute('opacity', '0.88');
      g.appendChild(bg);
      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', mx); txt.setAttribute('y', my - 2);
      txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('font-size', '8.5');
      txt.setAttribute('font-family', '-apple-system,sans-serif');
      txt.setAttribute('fill', rel.color); txt.setAttribute('font-weight', '700');
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
    t = document.createElement('div'); t.id = 'ner-bm-toolbar';
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
    scanBtn.textContent = 'Scan'; scanBtn.style.cssText = 'background:#2ecc71;color:#000';
    scanBtn.addEventListener('click', () => { clearHighlights(); runScan(); });
    t.appendChild(scanBtn);
    linesBtn = document.createElement('button');
    linesBtn.textContent = 'Lines'; linesBtn.style.cssText = 'background:#444;color:#fff';
    linesBtn.addEventListener('click', () => {
      linesVisible = !linesVisible;
      linesBtn.style.background = linesVisible ? '#e67e22' : '#444';
      if (linesVisible && !allRelations.length) allRelations = findRelations();
      drawRelationLines();
      if (linesVisible) {
        const panel = document.getElementById('ner-bm-panel');
        if (panel) panel.classList.remove('collapsed');
        switchTab('relations');
      }
    });
    t.appendChild(linesBtn);
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear'; clearBtn.style.cssText = 'background:#333;color:#fff';
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
  let activeTab = 'entities';

  function switchTab(name) {
    activeTab = name;
    document.querySelectorAll('.ner-bm-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    renderPanelBody();
  }

  function buildPanel() {
    if (document.getElementById('ner-bm-panel')) return;
    const panel = document.createElement('div'); panel.id = 'ner-bm-panel'; panel.classList.add('collapsed');
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
    panel.querySelector('#ner-bm-panel-header').addEventListener('click', () => panel.classList.toggle('collapsed'));
    panel.querySelectorAll('.ner-bm-tab').forEach(tab => {
      tab.addEventListener('click', e => { e.stopPropagation(); switchTab(tab.dataset.tab); });
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
    if (panel && panel.classList.contains('collapsed') && annotations.length > 0) panel.classList.remove('collapsed');
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
    if (!annotations.length) { body.innerHTML = '<p class="ner-bm-empty">No annotations yet — tap Scan or select text.</p>'; return; }
    const groups = {};
    annotations.forEach(a => { (groups[a.type] = groups[a.type] || []).push(a.text); });
    const order = ['PERSON','ORG','LOCATION','DATE','MONEY'];
    const types = [...order.filter(t => groups[t]), ...Object.keys(groups).filter(t => !order.includes(t))];
    types.forEach(type => {
      const color = COLORS[type] || '#aaa';
      const group = document.createElement('div'); group.className = 'ner-bm-group';
      group.innerHTML = `<div class="ner-bm-group-header">
        <span class="ner-bm-group-dot" style="background:${color}"></span>
        <span class="ner-bm-group-name" style="color:${color}">${type}</span>
        <span class="ner-bm-group-count">${groups[type].length}</span>
      </div>`;
      const chips = document.createElement('div'); chips.className = 'ner-bm-chips';
      const counts = {};
      groups[type].forEach(t => { counts[t] = (counts[t] || 0) + 1; });
      Object.entries(counts).forEach(([text, count]) => {
        const chip = document.createElement('span'); chip.className = 'ner-bm-chip';
        chip.style.cssText = `background:${color}22;border-color:${color}55;color:#ddd`;
        chip.innerHTML = `${escHtml(text)}${count > 1 ? `<span class="ner-rm">×${count}</span>` : ''}`;
        chip.addEventListener('click', () => scrollToEntity(text, type));
        chips.appendChild(chip);
      });
      group.appendChild(chips); body.appendChild(group);
    });
  }

  function renderRelations(body) {
    if (!allRelations.length) {
      body.innerHTML = '<p class="ner-bm-empty">No relations detected. Tap Scan first, then Lines.</p>';
      return;
    }
    // Group by category then label
    const cats = {};
    allRelations.forEach(r => {
      if (!cats[r.category]) cats[r.category] = {};
      (cats[r.category][r.label] = cats[r.category][r.label] || []).push(r);
    });
    Object.entries(cats).forEach(([cat, labels]) => {
      const catEl = document.createElement('div');
      catEl.className = 'ner-bm-cat-header';
      catEl.textContent = `${cat} (${Object.values(labels).reduce((s, a) => s + a.length, 0)})`;
      body.appendChild(catEl);
      Object.entries(labels).forEach(([label, rels]) => {
        const color = rels[0].color;
        const group = document.createElement('div'); group.className = 'ner-bm-group';
        group.innerHTML = `<div class="ner-bm-group-header">
          <span class="ner-bm-group-dot" style="background:${color}"></span>
          <span class="ner-bm-group-name" style="color:${color};font-size:10px">${label}</span>
          <span class="ner-bm-group-count">${rels.length}</span>
        </div>`;
        rels.forEach(rel => {
          const row = document.createElement('div'); row.className = 'ner-bm-rel-row';
          const fc = COLORS[rel.fromType] || '#aaa', tc = COLORS[rel.toType] || '#aaa';
          row.innerHTML = `
            <span class="ner-bm-rel-entity" style="background:${fc}22;color:${fc};border:1px solid ${fc}44" title="${escHtml(rel.from.textContent.trim())}">${escHtml(rel.from.textContent.trim())}</span>
            <span class="ner-bm-rel-arrow">→</span>
            <span class="ner-bm-rel-label" style="border-color:${color}55;color:${color}">${escHtml(label)}</span>
            <span class="ner-bm-rel-arrow">→</span>
            <span class="ner-bm-rel-entity" style="background:${tc}22;color:${tc};border:1px solid ${tc}44" title="${escHtml(rel.to.textContent.trim())}">${escHtml(rel.to.textContent.trim())}</span>
          `;
          row.addEventListener('click', () => { highlightPair(rel.from, rel.to); rel.from.scrollIntoView({ behavior:'smooth', block:'center' }); });
          group.appendChild(row);
        });
        body.appendChild(group);
      });
    });
  }

  function highlightPair(a, b) {
    document.querySelectorAll('mark.ner-bm-hi').forEach(m => m.classList.remove('ner-bm-hi'));
    a.classList.add('ner-bm-hi'); b.classList.add('ner-bm-hi');
    setTimeout(() => { a.classList.remove('ner-bm-hi'); b.classList.remove('ner-bm-hi'); }, 2500);
  }

  function scrollToEntity(text, type) {
    const mark = Array.from(document.querySelectorAll('mark.ner-bm-label'))
      .find(m => m.textContent.trim() === text && m.dataset.entity === type);
    if (mark) mark.scrollIntoView({ behavior:'smooth', block:'center' });
  }

  function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ── export ── */
  function buildExportData() {
    return {
      url: location.href, title: document.title, scannedAt: new Date().toISOString(),
      annotations: collectAnnotations(),
      relations: allRelations.map(r => ({
        from: r.from.textContent.trim(), fromType: r.fromType,
        relation: r.label, category: r.category,
        to: r.to.textContent.trim(), toType: r.toType
      }))
    };
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(buildExportData(), null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `ner-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  function copyJSON() {
    navigator.clipboard.writeText(JSON.stringify(buildExportData(), null, 2)).then(() => {
      const btn = document.getElementById('ner-bm-copy');
      if (!btn) return;
      const orig = btn.textContent; btn.textContent = 'Copied!';
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
    if (linesVisible) drawRelationLines();
    refreshPanel();
  }

  /* ── label application ── */
  function applyLabel(type, color) {
    if (!currentRange) return;
    try {
      const mark = document.createElement('mark');
      mark.className = 'ner-bm-label'; mark.dataset.entity = type;
      mark.style.cssText = `background:${color}2e;border-bottom:2px solid ${color}`; mark.title = type;
      currentRange.surroundContents(mark);
      mark.addEventListener('click', e => { e.stopPropagation(); showRemoveMenu(mark, e); });
    } catch (_) {}
    window.getSelection().removeAllRanges(); currentRange = null;
    allRelations = findRelations();
    if (linesVisible) drawRelationLines();
    refreshPanel();
  }

  function showRemoveMenu(span, e) {
    hideRemoveMenu();
    const menu = document.createElement('div'); menu.id = 'ner-bm-menu';
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

  function hideRemoveMenu() { const m = document.getElementById('ner-bm-menu'); if (m) m.remove(); }

  function unlabel(span) {
    const p = span.parentNode; if (!p) return;
    while (span.firstChild) p.insertBefore(span.firstChild, span);
    p.removeChild(span); p.normalize();
  }

  function clearHighlights() { document.querySelectorAll('mark.ner-bm-label').forEach(m => unlabel(m)); }

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
      const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
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
    let n; while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function highlightTextNode(textNode, matches) {
    const text = textNode.textContent;
    const frag = document.createDocumentFragment(); let last = 0;
    for (const m of matches) {
      if (m.start < last) continue;
      if (m.start > last) frag.appendChild(document.createTextNode(text.slice(last, m.start)));
      const color = COLORS[m.type] || '#aaa';
      const mark = document.createElement('mark');
      mark.className = 'ner-bm-label'; mark.dataset.entity = m.type;
      mark.style.cssText = `background:${color}2e;border-bottom:2px solid ${color}`; mark.title = m.type;
      mark.textContent = text.slice(m.start, m.end);
      mark.addEventListener('click', ev => { ev.stopPropagation(); showRemoveMenu(mark, ev); });
      frag.appendChild(mark); last = m.end;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.parentNode.replaceChild(frag, textNode);
  }

  function runScan() {
    const nodes = getTextNodes(document.body); let i = 0;
    function batch() {
      const end = Math.min(i + 50, nodes.length);
      for (; i < end; i++) {
        const node = nodes[i]; if (!node.parentNode) continue;
        const matches = detect(node.textContent);
        if (matches.length) highlightTextNode(node, matches);
      }
      if (i < nodes.length) { requestAnimationFrame(batch); } else {
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
  getSVG();
  runScan();

  window.__nerBMRescan = () => { clearHighlights(); allRelations = []; drawRelationLines(); runScan(); };
})();
