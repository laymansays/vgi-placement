/* ═══════════════════════════════════════════════════
   language_engine.js
   Deterministic language cleanup engine.
   No AI, no API. Runs on parsed resume sections
   before buildResumeHTML().
═══════════════════════════════════════════════════ */

// ── Proper nouns / tools that must stay capitalised ──
const ALWAYS_CAPS = new Set([
  'GST','TDS','PAN','UPI','NEFT','RTGS','NSS','NCC','CGPA','GPA','MBA','BCA',
  'BBA','BCom','MCom','MCA','BSc','MSc','BTech','MTech','PhD','PUC','SSLC','HSC',
  'SSC','AI','ML','SQL','HTML','CSS','JS','PHP','API','CRM','ERP','SAP','UI','UX',
  'IT','HR','PR','MIS','KPI','ROI','SOP','MOU','MOC','NGO','CSR','IPO','NSE','BSE',
  'SEBI','ICSI','NISM','ICAI','ICWA','CA','CS','CMA','LLB','BA','MA',
  'MS','Excel','Word','PowerPoint','Tally','Python','Java','Linux','Windows',
  'Android','iOS','Google','Microsoft','Amazon','Facebook','Instagram','LinkedIn',
  'GitHub','Zoom','Slack','Canva','Figma','MySQL','MongoDB','Firebase',
  'J.P.','Morgan','Bajaj','FinServ',
]);

// ── Words that must NOT be capitalised mid-sentence ──
const NEVER_CAPS_MID = new Set([
  'a','an','the','and','but','or','nor','for','so','yet',
  'in','on','at','to','by','of','up','as','is','are','was','were',
  'with','from','into','onto','over','than','that','this',
]);

// ── Weak verbs → strong action verbs ─────────────────
const WEAK_VERBS = [
  [/\bwas responsible for\b/gi,  'managed'],
  [/\bresponsible for\b/gi,      'managed'],
  [/\bhelped (to |in )?(.*)/gi,  'assisted in $2'],
  [/\bdid the\b/gi,              'executed the'],
  [/\bmade a\b/gi,               'developed a'],
  [/\bmade the\b/gi,             'developed the'],
  [/\bworked on\b/gi,            'developed'],
  [/\bworked with\b/gi,          'collaborated with'],
  [/\bwas part of\b/gi,          'contributed to'],
  [/\btried to\b/gi,             'aimed to'],
  [/\bgot (a |an )?(.*)/gi,      'achieved $2'],
  [/\bdoing\b/gi,                'executing'],
];

// ── Filler words to remove ────────────────────────────
const FILLERS = [
  /\bbasically\b/gi, /\bvery\b/gi, /\breally\b/gi,
  /\bjust\b/gi,      /\bstuff\b/gi,/\bthings\b/gi,
  /\bkind of\b/gi,   /\bsort of\b/gi, /\bactually\b/gi,
  /\bliterally\b/gi,
];

// ── Institution name normalisations ──────────────────
const INSTITUTION_NORMS = [
  // Pre-University variants → PU College
  [/\bPre[\s\-]*Universit\w+\b/gi,           'Pre-University'],
  [/\bP\.?\s*U\.?\s*C(ollege)?\b/gi,         'PU College'],
  [/\bPre[\s\-]*University\s+College\b/gi,    'PU College'],
  // Common abbreviations
  [/\bFirst\s+Grade\s+Degree\s+College\b/gi,  'First Grade College'],
  [/\bDegree\s+College\b/gi,                  'Degree College'],
  [/\bAnnapurneshwari\b/gi,                   'Annapurneshwari'],
];

// ── Sentence case for bullet/summary text ────────────
// Capitalises first word + known proper nouns, lowercases the rest
function toSentenceCase(str) {
  if (!str) return str;
  const words = str.trim().split(/\s+/);
  return words.map((word, i) => {
    const bare   = word.replace(/[^a-zA-Z]/g, '');
    const upper  = bare.toUpperCase();
    const titled = bare.charAt(0).toUpperCase() + bare.slice(1).toLowerCase();

    // Always-caps list
    if (ALWAYS_CAPS.has(upper) || ALWAYS_CAPS.has(bare)) {
      return word.replace(bare, upper === bare ? bare : ALWAYS_CAPS.has(bare) ? bare : upper);
    }
    // First word always capitalised
    if (i === 0) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    // Small connector words mid-sentence → lowercase
    if (NEVER_CAPS_MID.has(bare.toLowerCase())) return word.toLowerCase();
    // Everything else → lowercase mid-sentence
    return word.charAt(0).toLowerCase() + word.slice(1);
  }).join(' ');
}

// ── Punctuation cleanup ───────────────────────────────
function fixPunctuation(str) {
  return str
    .replace(/\s+,/g,  ',')          // space before comma
    .replace(/,(?=[^\s])/g, ', ')    // no space after comma
    .replace(/\s+\./g, '.')          // space before period
    .replace(/\.{2,}/g, '.')         // multiple periods
    .replace(/\s{2,}/g, ' ')         // multiple spaces
    .replace(/([a-z])\s*-\s*([a-z])/gi, '$1-$2')  // space around hyphen
    .trim();
}

// ── Grammar: remove fillers ───────────────────────────
function removeFillersFromText(str) {
  for (const rx of FILLERS) str = str.replace(rx, '');
  return str.replace(/\s{2,}/g, ' ').trim();
}

// ── Strengthen verbs ──────────────────────────────────
function strengthenVerbs(str) {
  for (const [rx, rep] of WEAK_VERBS) str = str.replace(rx, rep);
  return str;
}

// ── Bullet continuation rejoiner ─────────────────────
// Merges lines where a bullet was split across PDF rows
// e.g. "• Prepared business model including revenue," + "cost estimation"
// → "• Prepared business model including revenue, cost estimation"
function rejoinSplitBullets(lines) {
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const cur  = lines[i].trim();
    const next = lines[i + 1] ? lines[i + 1].trim() : null;

    if (!cur) continue;

    // Current line is a bullet or continuation of previous
    const curIsBullet  = /^[•·●\-–*▪▸►]/.test(cur);
    const nextIsBullet = next && /^[•·●\-–*▪▸►]/.test(next);
    const curEndsClean = /[.!?]$/.test(cur);

    // If current ends mid-sentence (no terminal punctuation)
    // AND next line is NOT a new bullet → it's a continuation
    if (!curEndsClean && next && !nextIsBullet && !curEndsClean) {
      // Merge next line into current
      lines[i + 1] = cur + ' ' + next.replace(/^[•·●\-–*▪▸►\s]+/, '');
      continue; // skip current, merged version will be processed as next
    }

    result.push(cur);
  }
  return result;
}

// ── Dual grade deduplication ──────────────────────────
// If both "79.5%" and "8.37 CGPA" exist in same edu entry text, keep only one
function deduplicateGrade(lines, wantCGPA) {
  return lines.map(line => {
    const pctMatch  = line.match(/(\d{1,3}(?:\.\d{1,2})?)\s*%/);
    const cgpaMatch = line.match(/(\d\.\d{1,2})\s*(?:CGPA|\/\s*10)/i);
    // If both exist on same line, remove the unwanted one
    if (pctMatch && cgpaMatch) {
      return wantCGPA
        ? line.replace(pctMatch[0], '').replace(/\s{2,}/g, ' ').trim()
        : line.replace(cgpaMatch[0], '').replace(/\s{2,}/g, ' ').trim();
    }
    return line;
  });
}

// ── Normalise institution names ───────────────────────
function normaliseInstitution(str) {
  for (const [rx, rep] of INSTITUTION_NORMS) str = str.replace(rx, rep);
  return str.trim();
}

// ── Process a single bullet line ─────────────────────
function processBullet(line) {
  let t = line.replace(/^[•·●\-–*▪▸►\s]+/, '').trim();
  t = fixPunctuation(t);
  t = removeFillersFromText(t);
  t = strengthenVerbs(t);
  t = toSentenceCase(t);
  // Bullets should not end with a full stop
  t = t.replace(/\.$/, '');
  return t;
}

// ── Process summary / about me paragraph ─────────────
function processSummary(lines) {
  let text = lines.join(' ');
  text = fixPunctuation(text);
  text = removeFillersFromText(text);
  text = strengthenVerbs(text);
  // Summary sentences should end with a period
  text = text.replace(/([a-zA-Z\d])\s*$/, '$1.');
  // Capitalise first letter of each sentence
  text = text.replace(/([.!?]\s+)([a-z])/g, (_, p, l) => p + l.toUpperCase());
  text = text.charAt(0).toUpperCase() + text.slice(1);
  return text;
}

// ── Main entry: clean all parsed sections ────────────
function cleanParsedSections(sections, wantCGPA) {

  // Summary
  if (sections.summary && sections.summary.length) {
    sections.summary = [processSummary(sections.summary)];
  }

  // Education
  if (sections.education && sections.education.length) {
    let edu = deduplicateGrade(sections.education, wantCGPA);
    edu = edu.map(l => normaliseInstitution(l));
    sections.education = edu;
  }

  // Projects
  if (sections.projects && sections.projects.length) {
    const rejoined = rejoinSplitBullets(sections.projects);
    sections.projects = rejoined.map(l => processBullet(l));
  }

  // Experience
  if (sections.experience && sections.experience.length) {
    const rejoined = rejoinSplitBullets(sections.experience);
    sections.experience = rejoined.map(l => processBullet(l));
  }

  // Skills — only capitalisation + dedup, no sentence processing
  if (sections.skills && sections.skills.length) {
    sections.skills = sections.skills.map(l => {
      const t = l.replace(/^[•·●\-–*▪▸►\s]+/, '').trim();
      // Preserve known tool names, just fix spacing
      return fixPunctuation(t);
    });
  }

  // Awards
  if (sections.awards && sections.awards.length) {
    const rejoined = rejoinSplitBullets(sections.awards);
    sections.awards = rejoined.map(l => processBullet(l));
  }

  // Certifications
  if (sections.certifications && sections.certifications.length) {
    sections.certifications = sections.certifications.map(l => processBullet(l));
  }

  return sections;
}
