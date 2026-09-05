// Ingredient text -> tags. Deterministic, dictionary-driven. No inference.
// Unknown text is reported as unrecognized; it is never treated as safe.

const PLURAL = '(?:s|es)?';

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRegex(entry) {
  const term = entry.term.trim().toLowerCase();
  const mode = entry.match || 'word';
  if (mode === 'substring') return new RegExp(escapeRe(term), 'i');
  // word and phrase: whole-token match with optional simple plural on the last word
  const parts = term.split(/\s+/).map(escapeRe);
  const last = parts.pop();
  const body = parts.length ? parts.join('\\s+') + '\\s+' + last : last;
  return new RegExp('(?:^|[^a-z0-9])(' + body + PLURAL + ')(?![a-z0-9])', 'i');
}

export function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[\r\n]+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Split an ingredient statement into segments: commas, semicolons, parentheses, brackets, "and/or".
export function segmentText(text) {
  const t = normalizeText(text)
    .replace(/^ingredients?:\s*/i, '')
    .replace(/[()\[\]{}]/g, ',')
    .replace(/\band\/or\b/g, ',');
  return t.split(/[,;.]+/).map(s => s.trim()).filter(Boolean);
}

export function buildMatcher(dictionaries) {
  const tagDefs = dictionaries.tags || {};
  const entries = (dictionaries.entries || []).map(e => ({
    term: e.term,
    tags: Array.isArray(e.tags) ? e.tags : [],
    match: e.match || 'word',
    note: e.note || '',
    portion_note: e.portion_note || '',
    re: buildRegex(e)
  }));

  function matchSegment(segment) {
    const tags = new Map(); // tag -> Set(terms)
    const unknownRisk = [];
    const matchedTerms = [];
    for (const e of entries) {
      if (!e.re.test(segment)) continue;
      matchedTerms.push(e.term);
      if (e.tags.length === 0) {
        unknownRisk.push({ term: e.term, note: e.note });
        continue;
      }
      for (const tag of e.tags) {
        if (!tags.has(tag)) tags.set(tag, new Set());
        tags.get(tag).add(e.term);
      }
    }
    return { segment, tags, unknownRisk, matchedTerms };
  }

  function tagText(text) {
    const segments = segmentText(text);
    const tags = new Map();
    const unknownRisk = [];
    const unrecognized = [];
    const notes = [];
    for (const seg of segments) {
      const r = matchSegment(seg);
      if (r.matchedTerms.length === 0) unrecognized.push(seg);
      for (const u of r.unknownRisk) unknownRisk.push({ ...u, segment: seg });
      for (const [tag, terms] of r.tags) {
        if (!tags.has(tag)) tags.set(tag, new Set());
        for (const t of terms) tags.get(tag).add(t);
      }
    }
    for (const e of entries) {
      if (e.portion_note && tags.size && [...tags.keys()].some(t => e.tags.includes(t))) {
        // attach portion notes for matched terms only
        for (const [, terms] of tags) if (terms.has(e.term)) notes.push({ term: e.term, note: e.portion_note });
      }
    }
    return {
      tags: Object.fromEntries([...tags].map(([k, v]) => [k, [...v]])),
      unknownRisk,
      unrecognized,
      notes,
      segments
    };
  }

  function tagLabel(tag) {
    return (tagDefs[tag] && tagDefs[tag].label) || tag;
  }
  function tagDef(tag) {
    return tagDefs[tag] || null;
  }
  function isHardTag(tag) {
    return !!(tagDefs[tag] && tagDefs[tag].hard);
  }

  return { tagText, tagLabel, tagDef, isHardTag, entryCount: entries.length, tags: tagDefs };
}
