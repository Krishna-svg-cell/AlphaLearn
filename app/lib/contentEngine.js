/**
 * AlphaLearn Content Engine — Local-First Architecture
 * 
 * This module handles:
 * 1. Loading class content JSON from /public/content/ (static files)
 * 2. Caching content in localStorage for offline use
 * 3. Deterministic daily mission generation (same algorithm as server.js)
 * 4. Random practice question selection
 * 
 * Content is NEVER fetched from the backend API.
 * Only progress/scores are synced to the server.
 */

const CONTENT_CACHE_PREFIX = 'al_content_';
const CONTENT_VERSION_KEY = 'al_content_version';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ==================== CONTENT LOADING ====================

/**
 * Load class content from static JSON file, with localStorage cache fallback.
 * @param {string} className - e.g. "1", "2", "10"
 * @returns {Promise<Object>} - { meanings, synonyms, antonyms, grammar, syllabus, sentences }
 */
export async function loadClassContent(className) {
  const cacheKey = `${CONTENT_CACHE_PREFIX}class${className}`;
  const cacheTimestampKey = `${cacheKey}_ts`;

  // Check cache first
  try {
    const cached = localStorage.getItem(cacheKey);
    const cachedTs = localStorage.getItem(cacheTimestampKey);
    if (cached && cachedTs) {
      const age = Date.now() - parseInt(cachedTs);
      if (age < CACHE_TTL) {
        return JSON.parse(cached);
      }
    }
  } catch (e) {
    console.warn('[ContentEngine] Cache read failed:', e);
  }

  // Fetch from static file
  try {
    const res = await fetch(`/content/class${className}.json`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Cache it
    try {
      localStorage.setItem(cacheKey, JSON.stringify(data));
      localStorage.setItem(cacheTimestampKey, String(Date.now()));
    } catch (e) {
      console.warn('[ContentEngine] Cache write failed (storage full?):', e);
    }

    return data;
  } catch (err) {
    console.error('[ContentEngine] Failed to fetch class content:', err);

    // Fallback to stale cache if available
    try {
      const stale = localStorage.getItem(cacheKey);
      if (stale) {
        console.warn('[ContentEngine] Using stale cache as fallback');
        return JSON.parse(stale);
      }
    } catch (e) { /* ignore */ }

    // Return empty structure
    return { meanings: [], synonyms: [], antonyms: [], grammar: [], syllabus: [], sentences: [] };
  }
}

// ==================== DETERMINISTIC MISSION GENERATION ====================
// This is the EXACT same algorithm as server.js, moved to the client.

/**
 * Get local date string in YYYY-MM-DD format (IST timezone).
 */
export function getLocalDateString(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * Deterministic shuffle + cyclic offset selection.
 * Ensures the same questions appear for the same date, and rotate daily.
 */
function getDeterministicRows(rows, limit, dateStr) {
  if (!rows || rows.length === 0) return [];

  // Fixed seed so the initial shuffle is identical every day for a given dataset
  let m_w = 12345;
  let m_z = 987654321;
  const mask = 0xffffffff;
  const random = () => {
    m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
    m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
    let result = ((m_z << 16) + m_w) & mask;
    result /= 4294967296;
    return result + 0.5;
  };

  const arr = [...rows];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  // Calculate days since epoch for cyclic offset
  const epoch = new Date('2026-01-01T00:00:00Z');
  const current = new Date(dateStr + 'T00:00:00Z');
  const daysSinceEpoch = Math.max(0, Math.floor((current - epoch) / (1000 * 60 * 60 * 24)));

  const actualLimit = Math.min(limit, arr.length);
  const offset = (daysSinceEpoch * limit) % arr.length;
  const result = [];
  for (let i = 0; i < actualLimit; i++) {
    result.push(arr[(offset + i) % arr.length]);
  }
  return result;
}

/**
 * Fix vocab entries to have proper options and correctIndex.
 */
function fixVocab(v) {
  if (Array.isArray(v)) {
    const word = v[0];
    const meaning = v[1];
    let opts = v.slice(1);
    // Shuffle options
    opts = opts.slice().sort(() => 0.5 - Math.random());
    return { word, meaning, options: opts, correctIndex: opts.indexOf(meaning) };
  }
  const opts = Array.isArray(v.options) ? v.options : [];
  let ansIdx = opts.indexOf(v.meaning);
  return { ...v, options: opts, correctIndex: ansIdx !== -1 ? ansIdx : v.correctIndex || 0 };
}

/**
 * Generate a deterministic daily mission from local content.
 * This produces the EXACT same output as server.js for the same date + class.
 * 
 * @param {Object} jsonData - The class content JSON
 * @param {string} dateStr - YYYY-MM-DD format date
 * @returns {Object} - { mission, hasContent, totalQuestions }
 */
export function generateDailyMission(jsonData, dateStr) {
  if (!dateStr) dateStr = getLocalDateString();

  const meaning = getDeterministicRows(jsonData.meanings || [], 5, dateStr).map(fixVocab);
  const synonym = getDeterministicRows(jsonData.synonyms || [], 5, dateStr).map(fixVocab);
  const antonym = getDeterministicRows(jsonData.antonyms || [], 5, dateStr).map(fixVocab);

  const grammar = getDeterministicRows(jsonData.grammar || [], 5, dateStr).map(g => {
    let opts = Array.isArray(g.o) ? g.o : (Array.isArray(g.opts) ? g.opts : []);
    const ansVal = g.a !== undefined ? g.a : g.ans;
    let ansIdx = parseInt(ansVal);
    if (isNaN(ansIdx)) ansIdx = opts.indexOf(ansVal);
    if (ansIdx < 0 || ansIdx >= opts.length) ansIdx = 0;
    return {
      id: g.id || Math.random().toString(),
      q: g.q || g.question_text,
      opts,
      ans: ansIdx,
      topic: g.t || g.topic,
      explanation: g.c || g.explanation || g.content
    };
  });

  let allSyllabusQs = [];
  (jsonData.syllabus || []).forEach(row => {
    // FLAT format (same as grammar): { t, c, q: "string", o: [], a }
    if (typeof row.q === 'string' && Array.isArray(row.o)) {
      let opts = row.o;
      const ansVal = row.a !== undefined ? row.a : row.ans;
      let ansIdx = parseInt(ansVal);
      if (isNaN(ansIdx)) ansIdx = opts.indexOf(ansVal);
      if (ansIdx < 0 || ansIdx >= opts.length) ansIdx = 0;
      allSyllabusQs.push({
        id: row.id || Math.random().toString(),
        q: row.q,
        opts,
        ans: ansIdx,
        topic: row.t || row.topic || 'Syllabus',
        explanation: row.c || row.content || row.explanation || '',
        lesson_title: row.l || row.lesson_title || row.t || 'Syllabus'
      });
    }
    // NESTED format: { s, l, c, quiz_data: [...] or q: [...] }
    else {
      const qs = Array.isArray(row.quiz_data) ? row.quiz_data : (Array.isArray(row.q) ? row.q : []);
      qs.forEach(q => {
        q.subject = row.subject || row.s;
        q.lesson_title = row.lesson_title || row.l;
        q.content = row.content || row.c;
        if (q.o && !q.opts) q.opts = q.o;
        if (q.a !== undefined && q.ans === undefined) q.ans = q.a;
      });
      allSyllabusQs.push(...qs);
    }
  });
  allSyllabusQs = getDeterministicRows(allSyllabusQs, 5, dateStr);

  const sentences = getDeterministicRows(jsonData.sentences || [], 5, dateStr).map(s => ({
    id: s.id || Math.random().toString(),
    correct_sentence: s.s || s.correct_sentence,
    words: s.w || s.words || []
  }));

  const hasContent = meaning.length > 0 || synonym.length > 0 || antonym.length > 0 ||
    grammar.length > 0 || allSyllabusQs.length > 0 || sentences.length > 0;
  const totalQuestions = meaning.length + synonym.length + antonym.length +
    grammar.length + allSyllabusQs.length + sentences.length;

  return {
    hasContent,
    totalQuestions,
    mission: { meaning, synonym, antonym, grammar, syllabus: allSyllabusQs, sentences }
  };
}

// ==================== PRACTICE MODE ====================

/**
 * Get random practice questions from local content.
 * @param {Object} jsonData - The class content JSON
 * @param {string} type - 'meaning' | 'synonym' | 'antonym' | 'grammar' | 'syllabus' | 'sentence'
 * @param {number} limit - Max questions
 * @returns {Array} - Array of question objects
 */
export function getPracticeQuestions(jsonData, type, limit = 10) {
  if (type === 'meaning' || type === 'synonym' || type === 'antonym') {
    const key = type === 'meaning' ? 'meanings' : type === 'synonym' ? 'synonyms' : 'antonyms';
    const items = (jsonData[key] || []).slice().sort(() => 0.5 - Math.random()).slice(0, limit);
    const prefix = type === 'meaning' ? 'Meaning of' : type === 'synonym' ? 'Synonym of' : 'Antonym of';
    return items.map(v => {
      const fixed = fixVocab(v);
      return { q: `${prefix}: ${fixed.word}`, opts: fixed.options, ans: fixed.correctIndex };
    });
  }

  if (type === 'grammar') {
    const items = (jsonData.grammar || []).slice().sort(() => 0.5 - Math.random()).slice(0, limit);
    return items.map(g => {
      let opts = Array.isArray(g.o) ? g.o : (Array.isArray(g.opts) ? g.opts : []);
      const ansVal = g.a !== undefined ? g.a : g.ans;
      let ansIdx = parseInt(ansVal);
      if (isNaN(ansIdx)) ansIdx = opts.indexOf(ansVal);
      if (ansIdx < 0 || ansIdx >= opts.length) ansIdx = 0;
      return { q: g.q || g.question_text, opts, ans: ansIdx };
    });
  }

  if (type === 'syllabus') {
    let allQs = [];
    (jsonData.syllabus || []).forEach(row => {
      const qs = Array.isArray(row.quiz_data) ? row.quiz_data : (Array.isArray(row.q) ? row.q : []);
      qs.forEach(q => {
        if (q.o && !q.opts) q.opts = q.o;
        if (q.a !== undefined && q.ans === undefined) q.ans = q.a;
      });
      allQs.push(...qs);
    });
    return allQs.sort(() => 0.5 - Math.random()).slice(0, limit);
  }

  if (type === 'sentence') {
    const items = (jsonData.sentences || []).slice().sort(() => 0.5 - Math.random()).slice(0, limit);
    return items.map(s => ({
      id: s.id || Math.random().toString(),
      correct_sentence: s.s || s.correct_sentence,
      words: s.w || s.words || [],
      type: 'sentence'
    }));
  }

  return [];
}

// ==================== DATE-BASED PRACTICE MODE ====================

// The daily mission uses 5 items per category. Practice must use the SAME
// offset (based on limit=5) so the first 5 items match the mission exactly.
const MISSION_LIMIT = 5;

/**
 * Deterministic selection using the mission's offset.
 * Always calculates offset with MISSION_LIMIT (5) so results align with the daily mission.
 * Then returns up to `limit` items starting from that same offset.
 */
function getMissionAlignedRows(rows, limit, dateStr) {
  if (!rows || rows.length === 0) return [];

  // Same fixed-seed shuffle as getDeterministicRows
  let m_w = 12345;
  let m_z = 987654321;
  const mask = 0xffffffff;
  const random = () => {
    m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
    m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
    let result = ((m_z << 16) + m_w) & mask;
    result /= 4294967296;
    return result + 0.5;
  };

  const arr = [...rows];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  const epoch = new Date('2026-01-01T00:00:00Z');
  const current = new Date(dateStr + 'T00:00:00Z');
  const daysSinceEpoch = Math.max(0, Math.floor((current - epoch) / (1000 * 60 * 60 * 24)));

  // KEY FIX: Use MISSION_LIMIT (5) for offset so we start at the same position as the daily mission
  const offset = (daysSinceEpoch * MISSION_LIMIT) % arr.length;
  const actualLimit = Math.min(limit, arr.length);
  const result = [];
  for (let i = 0; i < actualLimit; i++) {
    result.push(arr[(offset + i) % arr.length]);
  }
  return result;
}

/**
 * Get date-based practice questions aligned with today's Daily Mission.
 * The first 5 questions are EXACTLY the same as today's mission for that category.
 * Questions 6-10 continue from where the mission left off (next in the cycle).
 * 
 * @param {Object} jsonData - The class content JSON
 * @param {string} type - 'meaning' | 'synonym' | 'antonym' | 'grammar' | 'syllabus' | 'sentence'
 * @param {number} limit - Max questions (default 10)
 * @param {string} [dateStr] - Optional date override (defaults to today in IST)
 * @returns {Array} - Array of question objects for the given date
 */
export function getDailyPracticeQuestions(jsonData, type, limit = 10, dateStr) {
  if (!dateStr) dateStr = getLocalDateString();

  if (type === 'meaning' || type === 'synonym' || type === 'antonym') {
    const key = type === 'meaning' ? 'meanings' : type === 'synonym' ? 'synonyms' : 'antonyms';
    const items = getMissionAlignedRows(jsonData[key] || [], limit, dateStr).map(fixVocab);
    const prefix = type === 'meaning' ? 'Meaning of' : type === 'synonym' ? 'Synonym of' : 'Antonym of';
    return items.map(v => ({ q: `${prefix}: ${v.word}`, opts: v.options, ans: v.correctIndex }));
  }

  if (type === 'grammar') {
    const items = getMissionAlignedRows(jsonData.grammar || [], limit, dateStr);
    return items.map(g => {
      let opts = Array.isArray(g.o) ? g.o : (Array.isArray(g.opts) ? g.opts : []);
      const ansVal = g.a !== undefined ? g.a : g.ans;
      let ansIdx = parseInt(ansVal);
      if (isNaN(ansIdx)) ansIdx = opts.indexOf(ansVal);
      if (ansIdx < 0 || ansIdx >= opts.length) ansIdx = 0;
      return { q: g.q || g.question_text, opts, ans: ansIdx };
    });
  }

  if (type === 'syllabus') {
    let allQs = [];
    (jsonData.syllabus || []).forEach(row => {
      const qs = Array.isArray(row.quiz_data) ? row.quiz_data : (Array.isArray(row.q) ? row.q : []);
      qs.forEach(q => {
        if (q.o && !q.opts) q.opts = q.o;
        if (q.a !== undefined && q.ans === undefined) q.ans = q.a;
      });
      allQs.push(...qs);
    });
    return getMissionAlignedRows(allQs, limit, dateStr);
  }

  if (type === 'sentence') {
    const items = getMissionAlignedRows(jsonData.sentences || [], limit, dateStr);
    return items.map(s => ({
      id: s.id || Math.random().toString(),
      correct_sentence: s.s || s.correct_sentence,
      words: s.w || s.words || [],
      type: 'sentence'
    }));
  }

  return [];
}

// ==================== CACHE MANAGEMENT ====================

/**
 * Force refresh content cache for a specific class.
 */
export async function refreshContentCache(className) {
  const cacheKey = `${CONTENT_CACHE_PREFIX}class${className}`;
  const cacheTimestampKey = `${cacheKey}_ts`;
  localStorage.removeItem(cacheKey);
  localStorage.removeItem(cacheTimestampKey);
  return loadClassContent(className);
}

/**
 * Clear all cached content (useful for storage management).
 */
export function clearAllContentCache() {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith(CONTENT_CACHE_PREFIX)) {
      localStorage.removeItem(key);
    }
  });
}

/**
 * Get cache status info.
 */
export function getCacheStatus() {
  const keys = Object.keys(localStorage);
  const cachedClasses = [];
  let totalSize = 0;

  keys.forEach(key => {
    if (key.startsWith(CONTENT_CACHE_PREFIX) && !key.endsWith('_ts')) {
      const className = key.replace(CONTENT_CACHE_PREFIX + 'class', '');
      const data = localStorage.getItem(key);
      const ts = localStorage.getItem(key + '_ts');
      cachedClasses.push({
        className,
        sizeKB: Math.round((data?.length || 0) / 1024),
        cachedAt: ts ? new Date(parseInt(ts)).toISOString() : null,
        isStale: ts ? (Date.now() - parseInt(ts) > CACHE_TTL) : true
      });
      totalSize += data?.length || 0;
    }
  });

  return { cachedClasses, totalSizeKB: Math.round(totalSize / 1024) };
}
