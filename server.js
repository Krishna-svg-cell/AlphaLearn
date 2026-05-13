const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { getDb, initDb, closePool } = require('./db.js');

const PORT = process.env.BACKEND_PORT || 3001; // Fixed to 3001 to avoid conflict with Next.js (3000)
const SECRET_KEY = process.env.JWT_SECRET || 'alphalearn-secret-key';

// Helper to get local date string (YYYY-MM-DD) safely for India/Local Timezone
const getLocalDateString = (d = new Date()) => {
  return d.toLocaleDateString('en-CA', { timeZone: process.env.TIMEZONE || 'Asia/Kolkata' });
};
const getLocalTimestamp = (d = new Date()) => {
  return d.toLocaleString('en-CA', { timeZone: process.env.TIMEZONE || 'Asia/Kolkata', hour12: false }).replace(',', '');
};

// Helper to read class JSON data
const getClassJsonData = (className) => {
  const jsonPath = path.join(__dirname, 'data', `class${className}.json`);
  let data = { meanings: [], synonyms: [], antonyms: [], grammar: [], syllabus: [], sentences: [] };
  if (fs.existsSync(jsonPath)) {
    try { data = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch(e) { console.error('Error reading class JSON:', e); }
  }
  return data;
};

// Helper to save class JSON data
const saveClassJsonData = (className, data) => {
  const jsonPath = path.join(__dirname, 'data', `class${className}.json`);
  // Ensure directory exists
  const dir = path.dirname(jsonPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
};

(async () => {
  const server = express();

  // --- Security Middleware ---
  server.set('trust proxy', 1);
  server.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  }));
  server.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }));
  server.use(express.json({ limit: '1mb' }));

  // Prevent HTTP Parameter Pollution
  server.use((req, res, next) => {
    if (req.query) {
      for (const key in req.query) {
        if (Array.isArray(req.query[key])) {
          req.query[key] = req.query[key][req.query[key].length - 1];
        }
      }
    }
    next();
  });

  // Health check for Render deployment
  server.get('/healthz', (req, res) => res.status(200).send('OK'));
  server.get('/api/health', (req, res) => res.status(200).json({ status: 'healthy' }));

  // Security Audit Logging (Tracks suspicious activities)
  server.use((req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    res.on('finish', () => {
      if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 429) {
        console.warn(`[SECURITY AUDIT] ${res.statusCode} ${req.method} ${req.originalUrl} | IP: ${ip} | User: ${req.user ? req.user.username : 'Guest'} | Role: ${req.user ? req.user.role : 'None'}`);
      }
    });
    next();
  });

  // Rate limiting: 100 requests per minute per IP
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });
  server.use('/api/', apiLimiter);

  // Stricter rate limit for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many login attempts, please try again later.' },
  });
  server.use('/api/auth/login', authLimiter);

  try {
    await initDb();
  } catch (err) {
    console.error('⚠️ Could not initialize database schema at startup:', err.message);
    console.log('ℹ️ Server will continue starting. Database will be queried on-demand.');
  }


  // ==================== AUTH ====================

  server.post('/api/auth/login', async (req, res) => {
    const username = (req.body.username || '').trim();
    const password = req.body.password;
    try {
      const db = await getDb();
      // Case-insensitive login
      const user = await db.get('SELECT u.*, s.name as school_name FROM user u LEFT JOIN school s ON u.school_id = s.id WHERE LOWER(u.username) = LOWER(?)', [username]);
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

      const token = jwt.sign({
        id: user.id, role: user.role, username: user.username,
        school_id: user.school_id, class_name: user.class_name,
        section_name: user.section_name, board_name: user.board_name, school_name: user.school_name
      }, SECRET_KEY, { expiresIn: '24h' });

      res.json({ token, user: { id: user.id, username: user.username, role: user.role, school_name: user.school_name } });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  const authenticateToken = (req, res, next) => {
    if (req.user) return next(); // Idempotency
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized: Missing token' });
    jwt.verify(token, SECRET_KEY, (err, user) => {
      if (err) return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
      req.user = user;
      next();
    });
  };

  const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    next();
  };

  const verifySchoolContext = (req, res, next) => {
    if (!req.user || req.user.role === 'ADMIN') return next();
    const targetSchoolId = req.params.school_id || req.body.school_id || req.query.school_id;
    if (targetSchoolId && String(targetSchoolId) !== String(req.user.school_id)) {
        return res.status(403).json({ error: 'Forbidden: Cross-school access denied' });
    }
    next();
  };

  // Secure all specific prefixed paths
  server.use('/api/admin', authenticateToken, (req, res, next) => {
      // Allow PRINCIPAL to manage subject questions (for chapter quiz management)
      if (req.originalUrl.startsWith('/api/admin/subject-questions') && req.user.role === 'PRINCIPAL') return next();
      if ((req.originalUrl === '/api/admin/school/config' || req.originalUrl.startsWith('/api/admin/school/config?')) && req.user.role === 'PRINCIPAL') return next();
      return requireRole('ADMIN')(req, res, next);
  }, verifySchoolContext);
  server.use('/api/principal', authenticateToken, requireRole('PRINCIPAL'), verifySchoolContext);
  server.use('/api/staff', authenticateToken, requireRole('STAFF', 'ADMIN', 'PRINCIPAL'), verifySchoolContext);
  server.use('/api/student', authenticateToken, requireRole('STUDENT'), verifySchoolContext);
  server.use('/api/parent', authenticateToken, requireRole('PARENT'), verifySchoolContext);
  server.use('/api/daily-mission', authenticateToken, requireRole('STUDENT'), verifySchoolContext);

  server.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const db = await getDb();
      const user = await db.get('SELECT u.id, u.username, u.role, u.class_name, u.section_name, u.board_name, u.school_id, u.xp, u.streak, u.last_active_date, u.mapped_student_id, s.name as school_name FROM user u LEFT JOIN school s ON u.school_id = s.id WHERE u.id = ?', [req.user.id]);
      if (!user) return res.status(404).json({ error: 'User not found' });
      
      // Auto-reset broken streaks and notify ONLY Parent and Staff
      if (user.role === 'STUDENT' && user.streak > 0 && user.last_active_date) {
          let lastDateStr = user.last_active_date;
          if (lastDateStr.includes('T')) lastDateStr = lastDateStr.split('T')[0];
          const todayStr = getLocalDateString();
          const lastDate = new Date(lastDateStr + 'T00:00:00Z');
          const today = new Date(todayStr + 'T00:00:00Z');
          const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
          
          if (diffDays > 1) {
              await db.run('UPDATE user SET streak = 0 WHERE id = ?', [user.id]);
              user.streak = 0;
              
              const notifMsg = `⚠️ Streak Broken: ${user.username} missed their daily mission.`;
              const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
              // Notify assigned parent
              const parent = await db.get(`SELECT id FROM user WHERE role = 'PARENT' AND mapped_student_id = ? LIMIT 1`, [user.id]);
              if (parent) {
                  const existingNotif = await db.get("SELECT id FROM notification WHERE target_user_id = ? AND message = ? AND created_at >= ?", [parent.id, notifMsg, oneDayAgo]);
                  if (!existingNotif) await db.run("INSERT INTO notification (target_user_id, school_id, message) VALUES (?, ?, ?)", [parent.id, user.school_id, notifMsg]);
              }
              // Notify assigned staff
              const staff = await db.get(`SELECT id FROM user WHERE role = 'STAFF' AND school_id = ? AND class_name = ? AND (section_name = ? OR section_name IS NULL OR section_name = '') LIMIT 1`, 
                  [user.school_id, user.class_name, user.section_name]);
              if (staff) {
                  const existingNotif = await db.get("SELECT id FROM notification WHERE target_user_id = ? AND message = ? AND created_at >= ?", [staff.id, notifMsg, oneDayAgo]);
                  if (!existingNotif) await db.run("INSERT INTO notification (target_user_id, school_id, message) VALUES (?, ?, ?)", [staff.id, user.school_id, notifMsg]);
              }
          }
      }
      res.json(user);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.get('/api/debug-db', async (req, res) => {
    try {
      const db = await getDb();
      const users = await db.all("SELECT id, username, streak, last_active_date FROM user WHERE role = 'STUDENT' ORDER BY id DESC LIMIT 10");
      const missions = await db.all("SELECT * FROM daily_mission ORDER BY id DESC LIMIT 20");
      res.json({ users, missions });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== DAILY MISSION (STUDENT) ====================

  // LOCAL-FIRST: Lightweight status-only endpoint (no content payload)
  // Frontend generates mission content locally from cached class JSON files.
  // This endpoint only checks if today's mission is already completed.
  server.get('/api/daily-mission/status', authenticateToken, async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const db = await getDb();
      const dateStr = req.query.date || getLocalDateString();
      const status = await db.get('SELECT * FROM daily_mission WHERE user_id = ? AND date = ?', [req.user.id, dateStr]);
      res.json(status || { is_completed: false });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Legacy full mission endpoint (kept for backward compatibility with review/replay)
  server.get('/api/daily-mission', authenticateToken, async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const db = await getDb();
      const className = req.user.class_name || '1';
      const dateStr = req.query.date || getLocalDateString();
      const status = await db.get('SELECT * FROM daily_mission WHERE user_id = ? AND date = ?', [req.user.id, dateStr]);
      if (status && status.is_completed) {
        const answers = await db.all("SELECT section, question_text, selected_index, correct_index, is_correct, options_json FROM mission_answers WHERE user_id = ? AND date = ? ORDER BY id", [req.user.id, dateStr]);
        if (answers.length > 0) {
          const m = { meaning: [], synonym: [], antonym: [], grammar: [], syllabus: [], sentences: [] };
          answers.forEach(a => {
            let opts = [];
            try { opts = a.options_json ? JSON.parse(a.options_json) : []; } catch(e) {}
            if (['meaning', 'synonym', 'antonym'].includes(a.section)) {
              m[a.section].push({ word: a.question_text, correctIndex: parseInt(a.correct_index) || 0, options: opts });
            } else if (a.section === 'grammar') {
              m.grammar.push({ q: a.question_text, ans: parseInt(a.correct_index) || 0, opts: opts, topic: 'Review', explanation: 'Historical review.' });
            } else if (a.section === 'syllabus') {
              m.syllabus.push({ q: a.question_text, ans: parseInt(a.correct_index) || 0, opts: opts, lesson_title: 'Review', content: 'Historical review.' });
            } else if (a.section === 'sentence') {
              const words = (a.correct_index || a.question_text || '').split(' ').filter(w=>w.trim());
              m.sentences.push({ correct_sentence: a.correct_index || a.question_text, words: words });
            }
          });
          return res.json({
            status,
            hasContent: answers.length > 0,
            totalQuestions: answers.length,
            mission: m
          });
        }
      }

      // 6 modules × 5 questions = 30 total
      // Deterministic seed based on date so missions rotate correctly every day
      const seed = parseInt(dateStr.replace(/-/g, ''), 10);

      const jsonPath = path.join(__dirname, 'data', `class${className}.json`);
      let jsonData = { meanings: [], synonyms: [], antonyms: [], grammar: [], syllabus: [], sentences: [] };
      if (fs.existsSync(jsonPath)) {
        try { jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch(e) { console.error('Error reading JSON:', e); }
      }

      const epoch = new Date('2026-01-01T00:00:00Z');
      const current = new Date(dateStr + 'T00:00:00Z');
      const daysSinceEpoch = Math.max(0, Math.floor((current - epoch) / (1000 * 60 * 60 * 24)));

      const getDeterministicRows = (rows, limit) => {
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
        // Cyclic offset selection ensures no repeats on consecutive days
        const actualLimit = Math.min(limit, arr.length);
        const offset = (daysSinceEpoch * limit) % arr.length;
        const result = [];
        for (let i = 0; i < actualLimit; i++) {
          result.push(arr[(offset + i) % arr.length]);
        }
        return result;
      };

      const fixVocab = (v) => { 
        if (Array.isArray(v)) {
          const word = v[0];
          const meaning = v[1];
          let opts = v.slice(1);
          opts.sort(() => 0.5 - Math.random());
          return { word, meaning, options: opts, correctIndex: opts.indexOf(meaning) };
        }
        const opts = Array.isArray(v.options) ? v.options : [];
        let ansIdx = opts.indexOf(v.meaning); 
        return { ...v, options: opts, correctIndex: ansIdx !== -1 ? ansIdx : v.correctIndex || 0 }; 
      };

      const meaning = getDeterministicRows(jsonData.meanings, 5).map(fixVocab);
      const synonym = getDeterministicRows(jsonData.synonyms, 5).map(fixVocab);
      const antonym = getDeterministicRows(jsonData.antonyms, 5).map(fixVocab);

      const grammar = getDeterministicRows(jsonData.grammar, 5).map(g => {
        let opts = Array.isArray(g.o) ? g.o : (Array.isArray(g.opts) ? g.opts : []);
        const ansVal = g.a !== undefined ? g.a : g.ans;
        let ansIdx = parseInt(ansVal);
        if (isNaN(ansIdx)) ansIdx = opts.indexOf(ansVal);
        if (ansIdx < 0 || ansIdx >= opts.length) ansIdx = 0;
        return { id: g.id || Math.random().toString(), q: g.q || g.question_text, opts, ans: ansIdx, topic: g.t || g.topic, explanation: g.c || g.explanation || g.content };
      });

      let allSyllabusQs = [];
      (jsonData.syllabus || []).forEach(row => {
         const qs = Array.isArray(row.quiz_data) ? row.quiz_data : (Array.isArray(row.q) ? row.q : []);
         qs.forEach(q => { 
           q.subject = row.subject || row.s; 
           q.lesson_title = row.lesson_title || row.l; 
           q.content = row.content || row.c;
           // Normalize field names for frontend compatibility
           if (q.o && !q.opts) q.opts = q.o;
           if (q.a !== undefined && q.ans === undefined) q.ans = q.a;
         });
         allSyllabusQs.push(...qs);
      });
      allSyllabusQs = getDeterministicRows(allSyllabusQs, 5);

      const sentences = getDeterministicRows(jsonData.sentences, 5).map(s => {
        return { id: s.id || Math.random().toString(), correct_sentence: s.s || s.correct_sentence, words: s.w || s.words || [] };
      });

      const hasContent = meaning.length > 0 || synonym.length > 0 || antonym.length > 0 || grammar.length > 0 || allSyllabusQs.length > 0 || sentences.length > 0;
      const totalQuestions = meaning.length + synonym.length + antonym.length + grammar.length + allSyllabusQs.length + sentences.length;

      res.json({
        status: status || { is_completed: false },
        hasContent,
        totalQuestions,
        mission: { meaning, synonym, antonym, grammar, syllabus: allSyllabusQs, sentences }
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.post('/api/daily-mission/submit', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const dateStr = req.query.date || getLocalDateString();

      const { vocab_score, grammar_score, syllabus_score, sentence_score, answers, start_time, duration } = req.body;
      const total_xp = (vocab_score || 0) + (grammar_score || 0) + (syllabus_score || 0) + (sentence_score || 0);
      const completion_time = new Date().toISOString(); // Trust server-side UTC
      const start_time_utc = start_time || completion_time;

      // Check for duplicate submission
      const existing = await db.get('SELECT id FROM daily_mission WHERE user_id = ? AND date = ?', [req.user.id, dateStr]);
      if (existing) {
        return res.status(400).json({ error: 'Mission already completed today.' });
      }

      await db.run('INSERT INTO daily_mission (user_id, date, vocab_score, grammar_score, syllabus_score, sentence_score, is_completed, start_time, completion_time, duration) VALUES (?, ?, ?, ?, ?, ?, true, ?, ?, ?)',
        [req.user.id, dateStr, vocab_score, grammar_score, syllabus_score, sentence_score || 0, start_time_utc, completion_time, duration || 0]);

      if (answers && Array.isArray(answers)) {
        const timestamp = new Date().toISOString();
        for (const a of answers) {
          let optsJson = null;
          try { optsJson = JSON.stringify(a.options || []); } catch(e) {}
          await db.run('INSERT INTO mission_answers (user_id, date, section, question_text, selected_index, correct_index, is_correct, created_at, options_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [req.user.id, dateStr, a.section, String(a.question_text || ''), String(a.selected_index ?? ''), String(a.correct_index ?? ''), !!a.is_correct, timestamp, optsJson]);
        }
      }

      // -------------------------------------------------------------
      // Completely rebuilt Day Streak calculation (Mathematically exact)
      // -------------------------------------------------------------
      const userTzDate = getLocalDateString();
      const completedDates = await db.all('SELECT date FROM daily_mission WHERE user_id = ? AND is_completed = true ORDER BY date DESC', [req.user.id]);
      
      let calculatedStreak = 0;
      let checkDate = new Date(userTzDate + 'T00:00:00Z');
      
      const dateSet = new Set(completedDates.map(d => {
        if (typeof d.date === 'string') return d.date.split('T')[0];
        if (d.date instanceof Date) return d.date.toISOString().split('T')[0];
        return d.date;
      }));

      // If today is NOT completed, but yesterday is, start counting from yesterday.
      let dStr = checkDate.toISOString().split('T')[0];
      if (!dateSet.has(dStr)) {
        checkDate.setDate(checkDate.getDate() - 1);
        dStr = checkDate.toISOString().split('T')[0];
      }

      while (dateSet.has(dStr)) {
        calculatedStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
        dStr = checkDate.toISOString().split('T')[0];
      }

      await db.run('UPDATE user SET xp = xp + ?, streak = ?, last_active_date = ? WHERE id = ?', [total_xp, calculatedStreak, userTzDate, req.user.id]);
      const newStreak = calculatedStreak;


      // Badge logic
      if (newStreak >= 7) {
        const existing = await db.get("SELECT id FROM badge WHERE user_id = ? AND badge_name = 'Weekly Warrior'", [req.user.id]);
        if (!existing) await db.run("INSERT INTO badge (user_id, badge_name) VALUES (?, 'Weekly Warrior')", [req.user.id]);
      }
      if (newStreak >= 30) {
        const existing = await db.get("SELECT id FROM badge WHERE user_id = ? AND badge_name = 'Monthly Master'", [req.user.id]);
        if (!existing) await db.run("INSERT INTO badge (user_id, badge_name) VALUES (?, 'Monthly Master')", [req.user.id]);
      }

      // Notification
      const studentInfo = await db.get("SELECT id, usn FROM user WHERE id = ?", [req.user.id]);
      if (studentInfo && studentInfo.usn) {
        const parent = await db.get("SELECT id FROM user WHERE role = 'PARENT' AND mapped_student_id = ?", [studentInfo.id]);
        if (parent) {
          await db.run("INSERT INTO notification (target_user_id, school_id, message) VALUES (?, ?, ?)",
            [parent.id, req.user.school_id, `${req.user.username} completed today's daily mission! (+${total_xp} XP)`]);
        }
      }

      res.json({ message: 'Mission completed!', xpEarned: total_xp, streak: newStreak });
    } catch (err) { console.error('[SUBMIT ERROR]', err.message); res.status(500).json({ error: err.message }); }
  });

  // ==================== MISSION HISTORY / TRACKING ====================

  server.get('/api/student/progress-stats', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      // Using SUM with CASE for PostgreSQL/SQLite cross-compatibility
      const stats = await db.all(`
        SELECT section, 
               SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct, 
               SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) as incorrect 
        FROM mission_answers 
        WHERE user_id = ? 
        GROUP BY section
      `, [req.user.id]);
      
      const result = {};
      for (const row of stats) {
        result[row.section] = { correct: Number(row.correct) || 0, incorrect: Number(row.incorrect) || 0 };
      }
      res.json(result);
    } catch (err) { console.error('[PROGRESS STATS ERROR]', err.message); res.status(500).json({ error: err.message }); }
  });

  server.get('/api/student/history', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const history = await db.all(`
        SELECT dm.date, dm.vocab_score, dm.grammar_score, dm.syllabus_score,
          COALESCE(dm.sentence_score, 0) as sentence_score, dm.start_time, dm.completion_time, dm.duration,
          (SELECT COUNT(*) FROM mission_answers ma WHERE ma.user_id = dm.user_id AND ma.date = dm.date AND ma.is_correct = 1) as correct,
          (SELECT COUNT(*) FROM mission_answers ma WHERE ma.user_id = dm.user_id AND ma.date = dm.date AND ma.is_correct = 0) as incorrect
        FROM daily_mission dm
        WHERE dm.user_id = ?
        ORDER BY dm.date DESC
        LIMIT 30
      `, [req.user.id]);
      res.json(history);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.get('/api/student/history/:date', authenticateToken, async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const db = await getDb();
      const answers = await db.all("SELECT section, question_text, selected_index, correct_index, is_correct, created_at, options_json FROM mission_answers WHERE user_id = ? AND date = ? ORDER BY id", [req.user.id, req.params.date]);
      res.json(answers);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== REVIEW (Re-practice old missions) ====================

  server.get('/api/student/review', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      // Get all completed mission dates with timestamps and correct/incorrect counts
      const attempts = await db.all(`
        SELECT dm.date, dm.vocab_score, dm.grammar_score, dm.syllabus_score,
               COALESCE(dm.sentence_score, 0) as sentence_score,
               dm.start_time, dm.completion_time, dm.duration,
               (SELECT MIN(ma2.created_at) FROM mission_answers ma2 WHERE ma2.user_id = dm.user_id AND ma2.date = dm.date) as attempt_time,
               (SELECT COUNT(*) FROM mission_answers ma3 WHERE ma3.user_id = dm.user_id AND ma3.date = dm.date AND ma3.is_correct = true) as correct,
               (SELECT COUNT(*) FROM mission_answers ma4 WHERE ma4.user_id = dm.user_id AND ma4.date = dm.date AND ma4.is_correct = false) as incorrect
        FROM daily_mission dm
        WHERE dm.user_id = ? AND dm.is_completed = true
        ORDER BY dm.date DESC
      `, [req.user.id]);
      res.json(attempts);
    } catch (err) { console.error('[REVIEW LIST ERROR]', err.message); res.status(500).json({ error: err.message }); }
  });

  server.get('/api/student/review/:date', authenticateToken, async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const db = await getDb();
      const answers = await db.all(`
        SELECT section, question_text, selected_index, correct_index, is_correct, created_at, options_json
        FROM mission_answers
        WHERE user_id = ? AND date = ?
        ORDER BY id ASC
      `, [req.user.id, req.params.date]);
      res.json(answers);
    } catch (err) { console.error('[REVIEW DETAIL ERROR]', err.message); res.status(500).json({ error: err.message }); }
  });

  // Immutable mission reconstruction from stored answers (for replay)
  server.get('/api/student/review/:date/mission', authenticateToken, async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const db = await getDb();
      const dateStr = req.params.date;
      const status = await db.get('SELECT * FROM daily_mission WHERE user_id = ? AND date = ?', [req.user.id, dateStr]);
      if (!status || !status.is_completed) return res.status(404).json({ error: 'No completed mission found for this date' });

      const answers = await db.all("SELECT section, question_text, selected_index, correct_index, is_correct, options_json FROM mission_answers WHERE user_id = ? AND date = ? ORDER BY id", [req.user.id, dateStr]);

      // Reconstruct mission structure from stored immutable answers
      const m = { meaning: [], synonym: [], antonym: [], grammar: [], syllabus: [], sentences: [] };
      answers.forEach(a => {
        let opts = [];
        try { opts = a.options_json ? JSON.parse(a.options_json) : []; } catch(e) {}
        if (['meaning', 'synonym', 'antonym'].includes(a.section)) {
          m[a.section].push({ word: a.question_text, correctIndex: parseInt(a.correct_index) || 0, options: opts });
        } else if (a.section === 'grammar') {
          m.grammar.push({ q: a.question_text, ans: parseInt(a.correct_index) || 0, opts: opts, topic: 'Review', explanation: 'Historical review.' });
        } else if (a.section === 'syllabus') {
          m.syllabus.push({ q: a.question_text, ans: parseInt(a.correct_index) || 0, opts: opts, lesson_title: 'Review', content: 'Historical review.' });
        } else if (a.section === 'sentence') {
          const words = (a.correct_index || a.question_text || '').split(' ').filter(w=>w.trim());
          m.sentences.push({ correct_sentence: a.correct_index || a.question_text, words: words });
        }
      });

      const totalQuestions = answers.length;
      res.json({
        status,
        hasContent: totalQuestions > 0,
        totalQuestions,
        mission: m
      });
    } catch (err) { console.error('[REVIEW MISSION ERROR]', err.message); res.status(500).json({ error: err.message }); }
  });

  // ==================== ADMIN OVERVIEW ====================

  server.get('/api/admin/overview', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const schools = await db.get("SELECT COUNT(id) as count FROM school");
      const users = await db.get("SELECT COUNT(id) as count FROM user");
      res.json({ schools: schools.count, total_users: users.count });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== ADMIN: SCHOOLS CRUD ====================

  server.get('/api/admin/schools', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const schools = await db.all("SELECT * FROM school ORDER BY name");
      res.json(schools);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.post('/api/admin/schools', authenticateToken, async (req, res) => {
    try {
      const { name, address } = req.body;
      const db = await getDb();
      const result = await db.run("INSERT INTO school (name, address) VALUES (?, ?)", [name, address]);
      res.json({ id: result.lastID, name, address });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.delete('/api/admin/schools/:id', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      await db.run("DELETE FROM school WHERE id = ?", [req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== ADMIN: USERS CRUD ====================

  server.get('/api/admin/users', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const users = await db.all(`
        SELECT u.id, u.username, u.usn, u.role, u.school_id, s.name as school_name, u.class_name, u.section_name, u.board_name, u.mapped_student_id 
        FROM user u LEFT JOIN school s ON u.school_id = s.id
        ORDER BY u.role, u.username
      `);
      res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.post('/api/admin/user', authenticateToken, async (req, res) => {
    try {
      const { username, password, usn, role, school_id, class_name, section_name, board_name, mapped_student_id } = req.body;
      if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      const db = await getDb();
      const hash = await bcrypt.hash(password, 10);
      const result = await db.run(`
        INSERT INTO user (username, password, usn, role, school_id, class_name, section_name, board_name, mapped_student_id) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [username, hash, usn || null, role, school_id || null, class_name || null, section_name || null, board_name || null, mapped_student_id || null]);
      res.json({ message: "User created successfully", id: result.lastID });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.delete('/api/admin/user/:id', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      await db.run("DELETE FROM user WHERE id = ?", [req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== ADMIN: DATA ENGINE ====================

  server.post('/api/admin/data/vocab', authenticateToken, async (req, res) => {
    try {
      const { class_name, word, meaning, options, correct_index, type } = req.body;
      const data = getClassJsonData(class_name);
      const entry = { word, meaning, options, correctIndex: correct_index };
      if (type === 'meaning') data.meanings.push(entry);
      else if (type === 'synonym') data.synonyms.push(entry);
      else if (type === 'antonym') data.antonyms.push(entry);
      saveClassJsonData(class_name, data);
      res.json({ message: "Vocab added" });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.post('/api/admin/data/vocab/bulk', authenticateToken, async (req, res) => {
    try {
      const { items } = req.body;
      const classGroups = {};
      items.forEach(item => {
        if (!classGroups[item.class_name]) classGroups[item.class_name] = getClassJsonData(item.class_name);
        const entry = { word: item.word, meaning: item.meaning, options: item.options, correctIndex: item.correct_index };
        if (item.type === 'meaning') classGroups[item.class_name].meanings.push(entry);
        else if (item.type === 'synonym') classGroups[item.class_name].synonyms.push(entry);
        else if (item.type === 'antonym') classGroups[item.class_name].antonyms.push(entry);
      });
      for (const cls in classGroups) saveClassJsonData(cls, classGroups[cls]);
      res.json({ message: "Vocab batch added" });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.post('/api/admin/data/grammar', authenticateToken, async (req, res) => {
    try {
      const { class_name, topic, question_text, options, correct_answer } = req.body;
      const data = getClassJsonData(class_name);
      data.grammar.push({ topic, question_text, options, ans: correct_answer });
      saveClassJsonData(class_name, data);
      res.json({ message: "Grammar added" });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.post('/api/admin/data/grammar/bulk', authenticateToken, async (req, res) => {
    try {
      const { items } = req.body;
      const classGroups = {};
      items.forEach(item => {
        if (!classGroups[item.class_name]) classGroups[item.class_name] = getClassJsonData(item.class_name);
        classGroups[item.class_name].grammar.push({ topic: item.topic, question_text: item.question_text, options: item.options, ans: item.correct_answer });
      });
      for (const cls in classGroups) saveClassJsonData(cls, classGroups[cls]);
      res.json({ message: "Grammar batch added" });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.post('/api/admin/data/syllabus', authenticateToken, async (req, res) => {
    try {
      const { class_name, subject, lesson_title, quiz_data } = req.body;
      const data = getClassJsonData(class_name);
      data.syllabus.push({ subject, lesson_title, quiz_data });
      saveClassJsonData(class_name, data);
      res.json({ message: "Syllabus added" });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.post('/api/admin/data/syllabus/bulk', authenticateToken, async (req, res) => {
    try {
      const { items } = req.body;
      const classGroups = {};
      items.forEach(item => {
        if (!classGroups[item.class_name]) classGroups[item.class_name] = getClassJsonData(item.class_name);
        classGroups[item.class_name].syllabus.push({ subject: item.subject, lesson_title: item.lesson_title, quiz_data: item.quiz_data });
      });
      for (const cls in classGroups) saveClassJsonData(cls, classGroups[cls]);
      res.json({ message: "Syllabus batch added" });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== ADMIN: TESTS ====================

  server.post('/api/admin/tests', authenticateToken, async (req, res) => {
    try {
      const { school_id, class_name, section_name, title, questions } = req.body;
      const db = await getDb();
      const result = await db.run("INSERT INTO tests (school_id, class_name, section_name, title, questions) VALUES (?, ?, ?, ?, ?)",
        [school_id || null, class_name, section_name || null, title, JSON.stringify(questions)]);

      // Notify students
      await db.run("INSERT INTO notification (target_role, school_id, message) VALUES (?, ?, ?)",
        ['STUDENT', school_id, `New test assigned: ${title} for Class ${class_name}`]);

      res.json({ message: "Test created", id: result.lastID });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.get('/api/admin/tests', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const tests = await db.all("SELECT id, class_name, section_name, title, created_at FROM tests ORDER BY created_at DESC");
      res.json(tests);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== STUDENT: TESTS ====================

  server.get('/api/student/tests', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const tests = await db.all("SELECT id, title, class_name, section_name, created_at FROM tests WHERE class_name = ? AND (section_name IS NULL OR section_name = '' OR section_name = ?) ORDER BY created_at DESC",
        [req.user.class_name, req.user.section_name]);
      res.json(tests);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.get('/api/student/tests/:id', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const test = await db.get("SELECT * FROM tests WHERE id = ?", [req.params.id]);
      if (!test) return res.status(404).json({ error: 'Test not found' });
      test.questions = JSON.parse(test.questions);
      res.json(test);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  // 
  // ==================== STAFF ====================

  server.get('/api/staff/students', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      // Staff sees students in their school, class, section, and board
      let query = "SELECT id, username, usn, class_name, section_name, board_name, xp, streak FROM user WHERE role = 'STUDENT' AND school_id = ?";
      let params = [req.user.school_id];
      if (req.user.class_name) { query += " AND class_name = ?"; params.push(req.user.class_name); }
      if (req.user.section_name) { query += " AND section_name = ?"; params.push(req.user.section_name); }
      if (req.user.board_name) { query += " AND board_name = ?"; params.push(req.user.board_name); }
      query += " ORDER BY username";
      const students = await db.all(query, params);
      res.json(students);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== PRINCIPAL ====================

  server.get('/api/principal/stats', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const staff = await db.get("SELECT COUNT(id) as count FROM user WHERE school_id = ? AND role = 'STAFF'", [req.user.school_id]);
      const students = await db.get("SELECT COUNT(id) as count FROM user WHERE school_id = ? AND role = 'STUDENT'", [req.user.school_id]);
      res.json({ total_staff: staff.count, total_students: students.count });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.get('/api/principal/users', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const todayStr = getLocalDateString();
      const today = new Date(todayStr + 'T00:00:00Z');
      const users = (await db.all(`
        SELECT id, username, role, class_name, section_name, board_name, usn, xp, streak, last_active_date 
        FROM user 
        WHERE school_id = ? AND role IN ('STAFF', 'STUDENT', 'PARENT')
        ORDER BY role, class_name, section_name, username
      `, [req.user.school_id])).map(u => {
          if (u.role === 'STUDENT' && u.streak > 0 && u.last_active_date) {
              let ld = u.last_active_date.includes('T') ? u.last_active_date.split('T')[0] : u.last_active_date;
              if (Math.floor((today - new Date(ld + 'T00:00:00Z')) / 86400000) > 1) u.streak = 0;
          }
          return u;
      });
      res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== PARENT ====================

  server.get('/api/parent/student', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      let student = null;
      const parentUser = await db.get("SELECT mapped_student_id, class_name, section_name, board_name FROM user WHERE id = ?", [req.user.id]);
      if (parentUser && parentUser.mapped_student_id) {
        student = await db.get(`
          SELECT u.id, u.username, u.class_name, u.section_name, u.xp, u.streak, u.last_active_date, u.board_name, u.usn, s.name as school_name 
          FROM user u 
          LEFT JOIN school s ON u.school_id = s.id 
          WHERE u.role = 'STUDENT' AND u.id = ?`, 
          [parentUser.mapped_student_id]);
        if (student && student.streak > 0 && student.last_active_date) {
            let ld = student.last_active_date.includes('T') ? student.last_active_date.split('T')[0] : student.last_active_date;
            if (Math.floor((new Date(getLocalDateString() + 'T00:00:00Z') - new Date(ld + 'T00:00:00Z')) / 86400000) > 1) student.streak = 0;
        }
      }
      res.json({ student });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== PARENT: STUDENT HISTORY ====================

  server.get('/api/parent/student/history', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const parentUser = await db.get("SELECT mapped_student_id FROM user WHERE id = ?", [req.user.id]);
      if (!parentUser || !parentUser.mapped_student_id) return res.json([]);
      const student = await db.get("SELECT id FROM user WHERE role = 'STUDENT' AND id = ?", [parentUser.mapped_student_id]);
      if (!student) return res.json([]);
      const history = await db.all(`
        SELECT dm.date, dm.vocab_score, dm.grammar_score, dm.syllabus_score,
          COALESCE(dm.sentence_score, 0) as sentence_score,
          (SELECT COUNT(*) FROM mission_answers ma WHERE ma.user_id = dm.user_id AND ma.date = dm.date AND ma.is_correct = 1) as correct,
          (SELECT COUNT(*) FROM mission_answers ma WHERE ma.user_id = dm.user_id AND ma.date = dm.date AND ma.is_correct = 0) as incorrect
        FROM daily_mission dm
        WHERE dm.user_id = ?
        ORDER BY dm.date DESC LIMIT 30
      `, [student.id]);
      res.json(history);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.get('/api/parent/student/history/:date', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const parentUser = await db.get("SELECT mapped_student_id FROM user WHERE id = ?", [req.user.id]);
      if (!parentUser || !parentUser.mapped_student_id) return res.json([]);
      const student = await db.get("SELECT id FROM user WHERE role = 'STUDENT' AND id = ?", [parentUser.mapped_student_id]);
      if (!student) return res.json([]);
      const answers = await db.all(
        "SELECT section, question_text, selected_index, correct_index, is_correct, options_json FROM mission_answers WHERE user_id = ? AND date = ? ORDER BY id",
        [student.id, req.params.date]
      );
      res.json(answers);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== LEADERBOARD (SCHOOL-WISE) ====================

  server.get('/api/leaderboard', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      // School-wise leaderboard, NOT global
      let query = "SELECT id, username, xp, streak, last_active_date FROM user WHERE role = 'STUDENT' AND school_id = ?";
      let params = [req.user.school_id];
      if (req.query.class_name) { query += " AND class_name = ?"; params.push(req.query.class_name); }
      query += " ORDER BY xp DESC LIMIT 20";
      
      const todayStr = getLocalDateString();
      const today = new Date(todayStr + 'T00:00:00Z');
      const students = (await db.all(query, params)).map(s => {
          if (s.streak > 0 && s.last_active_date) {
              let ld = s.last_active_date.includes('T') ? s.last_active_date.split('T')[0] : s.last_active_date;
              if (Math.floor((today - new Date(ld + 'T00:00:00Z')) / 86400000) > 1) s.streak = 0;
          }
          return s;
      });
      res.json(students);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== STUDENT PRACTICE ====================

  server.get('/api/student/practice', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const type = req.query.type;
      const className = req.user.class_name || '1';
      let questions = [];

      const fixPracticeVocab = (v, prefix) => {
        const opts = JSON.parse(v.opts);
        let ansIdx = opts.indexOf(v.m);
        return { q: `${prefix}: ${v.q}`, opts, ans: ansIdx !== -1 ? ansIdx : v.ans };
      };

      if (type === 'meaning') {
        const rows = await db.all("SELECT word as q, meaning as m, options as opts, correct_index as ans FROM vocabulary WHERE type = 'meaning' AND class_name = ? ORDER BY RANDOM() LIMIT 10", [className]);
        questions = rows.map(v => fixPracticeVocab(v, 'Meaning of'));
      } else if (type === 'synonym') {
        const rows = await db.all("SELECT word as q, meaning as m, options as opts, correct_index as ans FROM vocabulary WHERE type = 'synonym' AND class_name = ? ORDER BY RANDOM() LIMIT 10", [className]);
        questions = rows.map(v => fixPracticeVocab(v, 'Synonym of'));
      } else if (type === 'antonym') {
        const rows = await db.all("SELECT word as q, meaning as m, options as opts, correct_index as ans FROM vocabulary WHERE type = 'antonym' AND class_name = ? ORDER BY RANDOM() LIMIT 10", [className]);
        questions = rows.map(v => fixPracticeVocab(v, 'Antonym of'));
      } else if (type === 'vocab') {
        const rows = await db.all("SELECT word as q, meaning as m, options as opts, correct_index as ans FROM vocabulary WHERE class_name = ? ORDER BY RANDOM() LIMIT 10", [className]);
        questions = rows.map(v => fixPracticeVocab(v, 'Meaning of'));
      } else if (type === 'grammar') {
        const rows = await db.all("SELECT question_text as q, options as opts, correct_answer as ans FROM grammar_module WHERE class_name = ? ORDER BY RANDOM() LIMIT 10", [className]);
        questions = rows.map(g => {
          const opts = JSON.parse(g.opts);
          let ansIdx = parseInt(g.ans);
          if (isNaN(ansIdx)) ansIdx = opts.indexOf(g.ans);
          return { q: g.q, opts, ans: ansIdx };
        });
      } else if (type === 'syllabus') {
        let rows = await db.all("SELECT quiz_data FROM syllabus WHERE class_name = ?", [className]);
        rows.forEach(row => {
          try { if (row.quiz_data) questions.push(...JSON.parse(row.quiz_data)); } catch (e) { }
        });
        questions = questions.sort(() => 0.5 - Math.random()).slice(0, 10);
      } else if (type === 'sentence') {
        const rows = await db.all("SELECT id, correct_sentence, words_json FROM sentence_exercise WHERE class_name = ? ORDER BY RANDOM() LIMIT 10", [className]);
        questions = rows.map(s => ({ id: s.id, correct_sentence: s.correct_sentence, words: JSON.parse(s.words_json), type: 'sentence' }));
      }
      res.json(questions);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.get('/api/student/badges', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const badges = await db.all("SELECT badge_name, earned_at FROM badge WHERE user_id = ? ORDER BY earned_at DESC", [req.user.id]);
      res.json(badges);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== STUDENT: TEST SUBMISSION ====================

  server.post('/api/student/tests/:id/submit', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const { score, total, answers } = req.body;
      const existing = await db.get("SELECT id FROM test_submission WHERE user_id = ? AND test_id = ?", [req.user.id, req.params.id]);
      if (existing) return res.status(400).json({ error: 'Test already submitted' });
      await db.run("INSERT INTO test_submission (user_id, test_id, score, total, answers_json) VALUES (?,?,?,?,?)",
        [req.user.id, req.params.id, score, total, JSON.stringify(answers || [])]);
      // Award XP for test
      const xp = score * 5;
      await db.run("UPDATE user SET xp = xp + ? WHERE id = ?", [xp, req.user.id]);
      res.json({ message: 'Test submitted', xpEarned: xp, score, total });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.get('/api/student/test-results', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const results = await db.all(`
        SELECT ts.test_id, ts.score, ts.total, ts.answers_json, ts.submitted_at, t.title
        FROM test_submission ts
        JOIN tests t ON ts.test_id = t.id
        WHERE ts.user_id = ?
        ORDER BY ts.submitted_at DESC
      `, [req.user.id]);
      res.json(results);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });



  // ==================== PRINCIPAL: STREAK CHECK ====================

  server.post('/api/principal/check-streaks', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const today = getLocalDateString();
      // Find students in this school who haven't done today's mission
      const missedStudents = await db.all(`
        SELECT u.id, u.username, u.usn, u.class_name, u.section_name, u.xp, u.streak
        FROM user u
        WHERE u.school_id = ? AND u.role = 'STUDENT'
        AND u.id NOT IN (SELECT user_id FROM daily_mission WHERE date = ?)
      `, [req.user.school_id, today]);

      let notified = 0;
      for (const s of missedStudents) {
        // Determine performance level
        const totalAnswers = await db.get("SELECT COUNT(*) as c FROM mission_answers WHERE user_id = ?", [s.id]);
        const correctAnswers = await db.get("SELECT COUNT(*) as c FROM mission_answers WHERE user_id = ? AND is_correct = 1", [s.id]);
        const accuracy = totalAnswers.c > 0 ? Math.round((correctAnswers.c / totalAnswers.c) * 100) : 0;
        const performanceTag = accuracy >= 80 ? '🟢 Good performer' : accuracy >= 50 ? '🟡 Average – needs practice' : '🔴 Needs improvement';

        // Find mapped parent and notify
        if (s.usn) {
          const parent = await db.get("SELECT id FROM user WHERE role = 'PARENT' AND mapped_student_id = ?", [s.id]);
          if (parent) {
            await db.run("INSERT INTO notification (target_user_id, school_id, message) VALUES (?, ?, ?)",
              [parent.id, req.user.school_id,
              `⚠️ Streak Alert: ${s.username} (Class ${s.class_name || '?'}${s.section_name ? '-' + s.section_name : ''}) has not completed today's daily mission.\n📊 Current XP: ${s.xp || 0} | Streak: ${s.streak || 0} days | ${performanceTag}\nPlease encourage them to complete their daily practice!`]);
            notified++;
          }
        }
        // Also notify the student
        await db.run("INSERT INTO notification (target_user_id, school_id, message) VALUES (?, ?, ?)",
          [s.id, req.user.school_id, `⏰ Reminder: You haven't completed today's daily mission yet! Don't break your ${s.streak || 0}-day streak. Complete it now!`]);

        // Find assigned staff and notify them
        const staff = await db.get("SELECT id FROM user WHERE role = 'STAFF' AND school_id = ? AND class_name = ? AND (section_name IS NULL OR section_name = ? OR section_name = '') LIMIT 1", [req.user.school_id, s.class_name, s.section_name]);
        if (staff) {
          await db.run("INSERT INTO notification (target_user_id, school_id, message) VALUES (?, ?, ?)",
            [staff.id, req.user.school_id, `⚠️ Streak Alert: Student ${s.username} missed today's daily mission.`]);
        }
      }
      res.json({ missed: missedStudents.length, notified, message: `Found ${missedStudents.length} students who missed today. Notified ${notified} parents with performance data.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== ADMIN: DATA LISTINGS ====================

  server.get('/api/admin/data/counts', authenticateToken, async (req, res) => {
    try {
      const cls = req.query.class_name;
      if (!cls) return res.json({});
      const data = getClassJsonData(cls);
      res.json({
        meaning: (data.meanings || []).length,
        synonym: (data.synonyms || []).length,
        antonym: (data.antonyms || []).length,
        grammar: (data.grammar || []).length,
        syllabus: (data.syllabus || []).length,
        sentence: (data.sentences || []).length
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.get('/api/admin/data/vocab', authenticateToken, async (req, res) => {
    try {
      const className = req.query.class_name;
      if (!className) return res.json([]);
      const data = getClassJsonData(className);
      const rows = [];
      (data.meanings || []).forEach((v, i) => {
        if (Array.isArray(v)) rows.push({ id: `m-${i}`, word: v[0], meaning: v[1], type: 'meaning', options: JSON.stringify(v.slice(1)), correct_index: 0 });
        else rows.push({ id: `m-${i}`, word: v.word, meaning: v.meaning, type: 'meaning', options: JSON.stringify(v.options || []), correct_index: v.correctIndex || 0 });
      });
      (data.synonyms || []).forEach((v, i) => {
        if (Array.isArray(v)) rows.push({ id: `s-${i}`, word: v[0], meaning: v[1], type: 'synonym', options: JSON.stringify(v.slice(1)), correct_index: 0 });
        else rows.push({ id: `s-${i}`, word: v.word, meaning: v.meaning, type: 'synonym', options: JSON.stringify(v.options || []), correct_index: v.correctIndex || 0 });
      });
      (data.antonyms || []).forEach((v, i) => {
        if (Array.isArray(v)) rows.push({ id: `a-${i}`, word: v[0], meaning: v[1], type: 'antonym', options: JSON.stringify(v.slice(1)), correct_index: 0 });
        else rows.push({ id: `a-${i}`, word: v.word, meaning: v.meaning, type: 'antonym', options: JSON.stringify(v.options || []), correct_index: v.correctIndex || 0 });
      });
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.get('/api/admin/data/grammar', authenticateToken, async (req, res) => {
    try {
      const className = req.query.class_name;
      if (!className) return res.json([]);
      const data = getClassJsonData(className);
      const rows = (data.grammar || []).map((g, i) => ({
        id: `g-${i}`,
        topic: g.t || g.topic || '',
        question_text: g.q || g.question_text || '',
        correct_answer: g.a !== undefined ? String(g.a) : String(g.ans || 0)
      }));
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.get('/api/admin/data/syllabus', authenticateToken, async (req, res) => {
    try {
      const className = req.query.class_name;
      if (!className) return res.json([]);
      const data = getClassJsonData(className);
      const rows = (data.syllabus || []).map((s, i) => ({
        id: `sy-${i}`,
        subject: s.subject || s.s || '',
        lesson_title: s.lesson_title || s.l || ''
      }));
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.get('/api/admin/data/sentence', authenticateToken, async (req, res) => {
    try {
      const className = req.query.class_name;
      if (!className) return res.json([]);
      const data = getClassJsonData(className);
      const rows = (data.sentences || []).map((s, i) => ({
        id: `se-${i}`,
        correct_sentence: s.s || s.correct_sentence || '',
        words_json: JSON.stringify(s.w || s.words || []),
        class_name: className
      }));
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.delete('/api/admin/data/:type/:id', authenticateToken, async (req, res) => {
    try {
      const { type, id } = req.params;
      const className = req.query.class_name;
      if (!className) return res.status(400).json({ error: 'Class name required for deletion' });
      
      const data = getClassJsonData(className);
      const [prefix, indexStr] = id.split('-');
      const idx = parseInt(indexStr, 10);
      
      if (type === 'vocab') {
        if (prefix === 'm' && data.meanings) data.meanings.splice(idx, 1);
        if (prefix === 's' && data.synonyms) data.synonyms.splice(idx, 1);
        if (prefix === 'a' && data.antonyms) data.antonyms.splice(idx, 1);
      } else if (type === 'grammar' && data.grammar) {
        data.grammar.splice(idx, 1);
      } else if (type === 'syllabus' && data.syllabus) {
        data.syllabus.splice(idx, 1);
      } else if (type === 'sentence' && data.sentences) {
        data.sentences.splice(idx, 1);
      }
      
      saveClassJsonData(className, data);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.delete('/api/admin/tests/:id', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      await db.run("DELETE FROM tests WHERE id = ?", [req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== ADMIN: SCHOOL DETAIL ====================

  server.get('/api/admin/schools/:id/details', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const school = await db.get("SELECT * FROM school WHERE id = ?", [req.params.id]);
      if (!school) return res.status(404).json({ error: 'School not found' });
      const users = await db.all("SELECT id, username, usn, role, class_name, section_name, board_name, mapped_student_id, xp, streak FROM user WHERE school_id = ? ORDER BY role, class_name, username", [req.params.id]);
      // Derive classes from users
      const classSet = new Set();
      users.forEach(u => { if (u.class_name) classSet.add(u.class_name); });
      const classes = [...classSet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      res.json({ school, users, classes });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== NOTIFICATIONS ====================

  server.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const notifications = await db.all(`
        SELECT message, created_at FROM notification
        WHERE target_user_id = ? 
           OR (target_user_id IS NULL AND target_role = ? AND (school_id = ? OR school_id IS NULL)) 
           OR (target_user_id IS NULL AND target_role IS NULL AND (school_id = ? OR school_id IS NULL))
        ORDER BY created_at DESC LIMIT 20
      `, [req.user.id, req.user.role, req.user.school_id, req.user.school_id]);
      res.json(notifications);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.post('/api/notifications', authenticateToken, async (req, res) => {
    try {
      const { message, target_role, school_id } = req.body;
      if (!message) return res.status(400).json({ error: 'Message is required' });
      const db = await getDb();
      const sid = school_id || req.user.school_id || null;
      await db.run("INSERT INTO notification (target_role, school_id, message) VALUES (?, ?, ?)",
        [target_role || null, sid, message]);
      res.json({ message: 'Notification sent' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== ADMIN: MCQ SETS ====================

  server.get('/api/admin/mcq-sets', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const rows = await db.all("SELECT m.*, s.name as school_name FROM mcq_set m LEFT JOIN school s ON m.school_id = s.id ORDER BY m.created_at DESC");
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.post('/api/admin/mcq-sets', authenticateToken, async (req, res) => {
    try {
      const { school_id, class_name, category, title, questions_json } = req.body;
      const db = await getDb();
      const result = await db.run("INSERT INTO mcq_set (school_id, class_name, category, title, questions_json) VALUES (?,?,?,?,?)",
        [school_id, class_name, category, title, questions_json]);
      res.json({ id: result.lastID, message: 'MCQ Set created' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.delete('/api/admin/mcq-sets/:id', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      await db.run("DELETE FROM mcq_set WHERE id = ?", [req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== ADMIN: SENTENCE EXERCISES ====================

  server.get('/api/admin/sentence-exercises', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const rows = await db.all("SELECT se.*, s.name as school_name FROM sentence_exercise se LEFT JOIN school s ON se.school_id = s.id ORDER BY se.created_at DESC");
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.post('/api/admin/sentence-exercises', authenticateToken, async (req, res) => {
    try {
      const { school_id, class_name, correct_sentence, words_json } = req.body;
      const db = await getDb();
      const result = await db.run("INSERT INTO sentence_exercise (school_id, class_name, correct_sentence, words_json) VALUES (?,?,?,?)",
        [school_id, class_name, correct_sentence, words_json]);
      res.json({ id: result.lastID, message: 'Sentence exercise created' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.delete('/api/admin/sentence-exercises/:id', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      await db.run("DELETE FROM sentence_exercise WHERE id = ?", [req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== STAFF: STUDENT HISTORY ====================

  server.get('/api/staff/student/:id/history', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      // Verify staff has access to this student (same school, class, section, board)
      if (req.user.role === 'STAFF') {
        let accessQuery = "SELECT id FROM user WHERE id = ? AND school_id = ? AND role = 'STUDENT'";
        let accessParams = [req.params.id, req.user.school_id];
        if (req.user.class_name) { accessQuery += " AND class_name = ?"; accessParams.push(req.user.class_name); }
        if (req.user.section_name) { accessQuery += " AND section_name = ?"; accessParams.push(req.user.section_name); }
        if (req.user.board_name) { accessQuery += " AND board_name = ?"; accessParams.push(req.user.board_name); }
        const accessible = await db.get(accessQuery, accessParams);
        if (!accessible) return res.status(403).json({ error: 'Access denied to this student' });
      }
      const history = await db.all(`
        SELECT dm.date, dm.vocab_score, dm.grammar_score, dm.syllabus_score, 
               COALESCE(dm.sentence_score, 0) as sentence_score, dm.is_completed,
               dm.start_time, dm.completion_time, dm.duration,
           (SELECT COUNT(*) FROM mission_answers ma WHERE ma.user_id = dm.user_id AND ma.date = dm.date AND ma.is_correct = true) as correct,
           (SELECT COUNT(*) FROM mission_answers ma WHERE ma.user_id = dm.user_id AND ma.date = dm.date AND ma.is_correct = false) as incorrect
        FROM daily_mission dm WHERE dm.user_id = ? ORDER BY dm.date DESC LIMIT 30
      `, [req.params.id]);
      res.json(history);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.get('/api/staff/student/:id/history/:date', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const answers = await db.all("SELECT section, question_text, selected_index, correct_index, is_correct, options_json FROM mission_answers WHERE user_id = ? AND date = ? ORDER BY id", [req.params.id, req.params.date]);
      res.json(answers);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });




  // ==================== WHITE-LABELING ====================
  server.get('/api/school/config', async (req, res) => {
    try {
      const db = await getDb();
      let query = "SELECT name, logo_url, primary_color FROM school ORDER BY id ASC LIMIT 1";
      if (req.query.school_id) {
          query = `SELECT name, logo_url, primary_color FROM school WHERE id = ?`;
          const school = await db.get(query, [req.query.school_id]);
          return res.json(school || {});
      }
      const school = await db.get(query);
      res.json(school || {});
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.put('/api/admin/school/config', authenticateToken, async (req, res) => {
    try {
      if (req.user.role !== 'ADMIN' && req.user.role !== 'PRINCIPAL') return res.status(403).json({error: 'Forbidden'});
      const db = await getDb();
      const { logo_url, primary_color, name } = req.body;
      const schoolId = req.user.role === 'PRINCIPAL' ? req.user.school_id : (req.body.school_id || 1);
      
      const updateFields = [];
      const params = [];
      if (logo_url !== undefined) { updateFields.push('logo_url = ?'); params.push(logo_url); }
      if (primary_color !== undefined) { updateFields.push('primary_color = ?'); params.push(primary_color); }
      if (name !== undefined) { updateFields.push('name = ?'); params.push(name); }
      
      if (updateFields.length > 0) {
          params.push(schoolId);
          await db.run(`UPDATE school SET ${updateFields.join(', ')} WHERE id = ?`, params);
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.get('/api/unread-counts', authenticateToken, async (req, res) => {
    try {
        const db = await getDb();
        const msg = await db.get(`SELECT COUNT(*) as c FROM communication WHERE receiver_id = ? AND is_read = false`, [req.user.id]);
        res.json({ unreadMessages: msg?.c || 0, unreadNotifications: 0 }); // Notifications don't have is_read column yet
    } catch(err) { res.status(500).json({error: err.message}); }
  });

  // ==================== COMMUNICATION ====================
  server.get('/api/communication/messages', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      let query, params;
      if (req.user.role === 'STUDENT') {
          query = `SELECT c.*, u.username as sender_name, u.role as sender_role 
                   FROM communication c JOIN "user" u ON c.sender_id = u.id 
                   WHERE c.sender_id = ? OR c.receiver_id = ? ORDER BY c.created_at ASC`;
          params = [req.user.id, req.user.id];
      } else if (req.user.role === 'STAFF') {
          const studentId = req.query.student_id;
          if (!studentId) return res.status(400).json({error: 'student_id required'});
          query = `SELECT c.*, u.username as sender_name, u.role as sender_role 
                   FROM communication c JOIN "user" u ON c.sender_id = u.id 
                   WHERE (c.sender_id = ? AND c.receiver_id = ?) OR (c.sender_id = ? AND c.receiver_id = ?) 
                   ORDER BY c.created_at ASC`;
          params = [req.user.id, studentId, studentId, req.user.id];
      } else {
          return res.status(403).json({error: 'Forbidden'});
      }
      const messages = await db.all(query, params);
      res.json(messages);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.post('/api/communication/messages', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const { message, receiver_id } = req.body;
      let targetId = receiver_id;
      
      if (req.user.role === 'STUDENT' && !targetId) {
          const staff = await db.get(`SELECT id FROM "user" WHERE role = 'STAFF' AND school_id = ? AND class_name = ? AND (section_name = ? OR section_name IS NULL OR section_name = '') LIMIT 1`, 
              [req.user.school_id, req.user.class_name, req.user.section_name]);
          if (!staff) return res.status(400).json({error: 'No staff assigned to your class'});
          targetId = staff.id;
      }
      
      if (!targetId || !message) return res.status(400).json({error: 'Missing fields'});
      
      await db.run(`INSERT INTO communication (sender_id, receiver_id, message) VALUES (?, ?, ?)`, [req.user.id, targetId, message]);
      
      const notifMsg = `New message from ${req.user.username}`;
      const existingNotif = await db.get("SELECT created_at FROM notification WHERE target_user_id = ? AND message = ? ORDER BY created_at DESC LIMIT 1", [targetId, notifMsg]);
      if (!existingNotif || (new Date() - new Date(existingNotif.created_at)) > 3600000) {
        await db.run("INSERT INTO notification (target_user_id, school_id, message) VALUES (?, ?, ?)",
          [targetId, req.user.school_id, notifMsg]);
      }
        
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  
  server.put('/api/communication/messages/read', authenticateToken, async (req, res) => {
      try {
          const db = await getDb();
          const senderId = req.body.sender_id;
          if (senderId) {
              await db.run(`UPDATE communication SET is_read = true WHERE receiver_id = ? AND sender_id = ?`, [req.user.id, senderId]);
          } else {
              await db.run(`UPDATE communication SET is_read = true WHERE receiver_id = ?`, [req.user.id]);
          }
          res.json({ success: true });
      } catch(err) { res.status(500).json({error: err.message}); }
  });


  // ==================== MULTI-SUBJECT ACADEMICS ====================

  // --- Subject Catalog (all users) ---
  server.get('/api/subjects', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const subjects = await db.all('SELECT * FROM subject ORDER BY display_order');
      res.json(subjects);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // --- Principal: Subject Configuration ---
  server.get('/api/principal/subjects', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const configs = await db.all(`
        SELECT ss.*, s.name as subject_name, s.code, s.icon, s.color, s.category,
               u.username as teacher_name
        FROM school_subject ss
        JOIN subject s ON ss.subject_id = s.id
        LEFT JOIN "user" u ON ss.assigned_teacher_id = u.id
        WHERE ss.school_id = ?
        ORDER BY s.display_order
      `, [req.user.school_id]);
      res.json(configs);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.post('/api/principal/subjects', authenticateToken, async (req, res) => {
    try {
      const { subject_id, class_name, section_name, is_mandatory, assigned_teacher_id } = req.body;
      const db = await getDb();
      const result = await db.run(
        'INSERT INTO school_subject (school_id, subject_id, class_name, section_name, is_mandatory, assigned_teacher_id) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.school_id, subject_id, class_name, section_name || null, is_mandatory !== false, assigned_teacher_id || null]
      );
      res.json({ message: 'Subject enabled', id: result.lastID });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.put('/api/principal/subjects/:id', authenticateToken, async (req, res) => {
    try {
      const { is_enabled, is_mandatory, assigned_teacher_id } = req.body;
      const db = await getDb();
      await db.run(
        'UPDATE school_subject SET is_enabled = ?, is_mandatory = ?, assigned_teacher_id = ? WHERE id = ? AND school_id = ?',
        [is_enabled !== false, is_mandatory !== false, assigned_teacher_id || null, req.params.id, req.user.school_id]
      );
      res.json({ message: 'Subject config updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.delete('/api/principal/subjects/:id', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      await db.run('DELETE FROM school_subject WHERE id = ? AND school_id = ?', [req.params.id, req.user.school_id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Principal: Add custom subject
  server.post('/api/principal/subjects/custom', authenticateToken, async (req, res) => {
    try {
      const { name, code, icon, color, category } = req.body;
      const db = await getDb();
      const result = await db.run(
        'INSERT INTO subject (name, code, icon, color, category, is_system) VALUES (?, ?, ?, ?, ?, false)',
        [name, code.toUpperCase(), icon || '📚', color || '#64748b', category || 'elective']
      );
      res.json({ message: 'Custom subject created', id: result.lastID });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // --- Principal: Chapter Management ---
  server.get('/api/principal/chapters', authenticateToken, async (req, res) => {
    try {
      const { subject_id, class_name } = req.query;
      const db = await getDb();
      const chapters = await db.all(
        'SELECT * FROM subject_chapter WHERE school_id = ? AND subject_id = ? AND class_name = ? ORDER BY display_order, chapter_number',
        [req.user.school_id, subject_id, class_name]
      );
      res.json(chapters);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.post('/api/principal/chapters', authenticateToken, async (req, res) => {
    try {
      const { subject_id, class_name, chapter_number, chapter_title, description, content } = req.body;
      const num = parseInt(chapter_number);
      if (!subject_id || !class_name || isNaN(num) || num < 1) {
        return res.status(400).json({ error: 'Invalid chapter number. Must be a positive integer.' });
      }
      if (!chapter_title || !chapter_title.trim()) {
        return res.status(400).json({ error: 'Chapter title is required.' });
      }
      const db = await getDb();
      const result = await db.run(
        'INSERT INTO subject_chapter (school_id, subject_id, class_name, chapter_number, chapter_title, description, content, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [req.user.school_id, subject_id, class_name, num, chapter_title.trim(), description || '', content || '', num]
      );
      res.json({ message: 'Chapter added', id: result.lastID });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.put('/api/principal/chapters/:id', authenticateToken, async (req, res) => {
    try {
      const { chapter_title, description, content, chapter_number } = req.body;
      const db = await getDb();
      await db.run('UPDATE subject_chapter SET chapter_title = ?, description = ?, content = ?, chapter_number = ? WHERE id = ? AND school_id = ?',
        [chapter_title, description || '', content || '', chapter_number, req.params.id, req.user.school_id]);
      res.json({ message: 'Chapter updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.delete('/api/principal/chapters/:id', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      await db.run('DELETE FROM subject_chapter WHERE id = ? AND school_id = ?', [req.params.id, req.user.school_id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // --- Admin/Staff: Subject Questions ---
  server.get('/api/admin/subject-questions', authenticateToken, async (req, res) => {
    try {
      const { subject_id, class_name, chapter_id } = req.query;
      const db = await getDb();
      let query = 'SELECT sq.*, s.name as subject_name, sc.chapter_title FROM subject_question sq JOIN subject s ON sq.subject_id = s.id LEFT JOIN subject_chapter sc ON sq.chapter_id = sc.id WHERE sq.subject_id = ? AND sq.class_name = ?';
      let params = [subject_id, class_name];
      if (chapter_id) { query += ' AND sq.chapter_id = ?'; params.push(chapter_id); }
      query += ' ORDER BY sq.created_at DESC';
      const questions = await db.all(query, params);
      res.json(questions);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.post('/api/admin/subject-questions', authenticateToken, async (req, res) => {
    try {
      const { subject_id, chapter_id, class_name, question_text, question_type, options, correct_answer, explanation, difficulty, school_id } = req.body;
      const db = await getDb();
      const sid = school_id || req.user.school_id;
      const result = await db.run(
        'INSERT INTO subject_question (school_id, subject_id, chapter_id, class_name, question_text, question_type, options_json, correct_answer, explanation, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [sid, subject_id, chapter_id || null, class_name, question_text, question_type || 'mcq', JSON.stringify(options || []), correct_answer, explanation || '', difficulty || 'medium']
      );
      res.json({ message: 'Question added', id: result.lastID });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.post('/api/admin/subject-questions/bulk', authenticateToken, async (req, res) => {
    try {
      const { items } = req.body;
      const db = await getDb();
      let count = 0;
      for (const q of items) {
        const sid = q.school_id || req.user.school_id;
        await db.run(
          'INSERT INTO subject_question (school_id, subject_id, chapter_id, class_name, question_text, question_type, options_json, correct_answer, explanation, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [sid, q.subject_id, q.chapter_id || null, q.class_name, q.question_text, q.question_type || 'mcq', JSON.stringify(q.options || []), q.correct_answer, q.explanation || '', q.difficulty || 'medium']
        );
        count++;
      }
      res.json({ message: `${count} questions added` });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.delete('/api/admin/subject-questions/:id', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      await db.run('DELETE FROM subject_question WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.get('/api/admin/subject-questions/counts', authenticateToken, async (req, res) => {
    try {
      const { class_name, school_id } = req.query;
      const db = await getDb();
      const sid = school_id || req.user.school_id;
      const counts = await db.all(
        'SELECT subject_id, COUNT(*) as count FROM subject_question WHERE school_id = ? AND class_name = ? GROUP BY subject_id',
        [sid, class_name]
      );
      const result = {};
      counts.forEach(c => { result[c.subject_id] = Number(c.count); });
      res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // --- Student: Subject APIs ---
  server.get('/api/student/subjects', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      // Get subjects enabled for this student's school and class
      const subjects = await db.all(`
        SELECT s.*, ss.is_mandatory, ss.assigned_teacher_id,
               u.username as teacher_name
        FROM school_subject ss
        JOIN subject s ON ss.subject_id = s.id
        LEFT JOIN "user" u ON ss.assigned_teacher_id = u.id
        WHERE ss.school_id = ? AND ss.class_name = ? AND ss.is_enabled = true
              AND (ss.section_name IS NULL OR ss.section_name = '' OR ss.section_name = ?)
        ORDER BY s.display_order
      `, [req.user.school_id, req.user.class_name, req.user.section_name]);
      res.json(subjects);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.get('/api/student/subject-chapters', authenticateToken, async (req, res) => {
    try {
      const { subject_id } = req.query;
      const db = await getDb();
      const chapters = await db.all(
        'SELECT sc.*, (SELECT COUNT(*) FROM subject_question sq WHERE sq.chapter_id = sc.id) as question_count FROM subject_chapter sc WHERE sc.school_id = ? AND sc.subject_id = ? AND sc.class_name = ? ORDER BY sc.display_order, sc.chapter_number',
        [req.user.school_id, subject_id, req.user.class_name]
      );
      res.json(chapters);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.get('/api/student/subject-quiz', authenticateToken, async (req, res) => {
    try {
      const { subject_id, chapter_id } = req.query;
      const db = await getDb();
      let query = 'SELECT id, question_text, question_type, options_json, difficulty FROM subject_question WHERE school_id = ? AND subject_id = ? AND class_name = ?';
      let params = [req.user.school_id, subject_id, req.user.class_name];
      if (chapter_id) { query += ' AND chapter_id = ?'; params.push(chapter_id); }
      query += ' ORDER BY random() LIMIT 10';
      const questions = await db.all(query, params);
      // Don't send correct_answer to client
      const clientQs = questions.map(q => {
        let opts = [];
        try { opts = JSON.parse(q.options_json || '[]'); } catch(e) {}
        return { id: q.id, question_text: q.question_text, question_type: q.question_type, options: opts, difficulty: q.difficulty, correct_answer: q.correct_answer };
      });
      res.json(clientQs);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  server.post('/api/student/subject-quiz/submit', authenticateToken, async (req, res) => {
    try {
      const { subject_id, chapter_id, answers } = req.body;
      const db = await getDb();
      let correct = 0, total = 0;
      for (const ans of (answers || [])) {
        const q = await db.get('SELECT correct_answer, options_json FROM subject_question WHERE id = ?', [ans.question_id]);
        if (!q) continue;
        total++;
        // Support both index-based and text-based correct_answer
        const isCorrect = String(ans.selected_answer) === String(q.correct_answer);
        if (isCorrect) correct++;
      }
      const xp = correct * 10;
      
      // Upsert progress — handle NULL chapter_id explicitly to avoid PostgreSQL NULL comparison issues
      let existing;
      if (chapter_id) {
        existing = await db.get(
          'SELECT id, total_attempted, total_correct, xp_earned FROM subject_progress WHERE user_id = ? AND subject_id = ? AND chapter_id = ?',
          [req.user.id, subject_id, chapter_id]
        );
      } else {
        existing = await db.get(
          'SELECT id, total_attempted, total_correct, xp_earned FROM subject_progress WHERE user_id = ? AND subject_id = ? AND chapter_id IS NULL',
          [req.user.id, subject_id]
        );
      }

      if (existing) {
        await db.run(
          'UPDATE subject_progress SET total_attempted = total_attempted + ?, total_correct = total_correct + ?, xp_earned = xp_earned + ?, last_activity = NOW() WHERE id = ?',
          [total, correct, xp, existing.id]
        );
      } else {
        await db.run(
          'INSERT INTO subject_progress (user_id, subject_id, chapter_id, total_attempted, total_correct, xp_earned) VALUES (?, ?, ?, ?, ?, ?)',
          [req.user.id, subject_id, chapter_id || null, total, correct, xp]
        );
      }
      // Add XP to user
      await db.run('UPDATE "user" SET xp = xp + ? WHERE id = ?', [xp, req.user.id]);
      res.json({ correct, total, xp_earned: xp, accuracy: total > 0 ? Math.round((correct / total) * 100) : 0 });
    } catch (err) {
      console.error('❌ Subject quiz submit error:', err.message);
      console.error('   Stack:', err.stack?.split('\n')[1]);
      res.status(500).json({ error: err.message });
    }
  });

  server.get('/api/student/subject-progress', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const progress = await db.all(`
        SELECT sp.*, s.name as subject_name, s.icon, s.color, s.code,
               sc.chapter_title
        FROM subject_progress sp
        JOIN subject s ON sp.subject_id = s.id
        LEFT JOIN subject_chapter sc ON sp.chapter_id = sc.id
        WHERE sp.user_id = ?
        ORDER BY s.display_order
      `, [req.user.id]);
      res.json(progress);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // --- Staff: Subject Progress Viewing ---
  server.get('/api/staff/student/:id/subject-progress', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const progress = await db.all(`
        SELECT sp.*, s.name as subject_name, s.icon, s.color, s.code
        FROM subject_progress sp
        JOIN subject s ON sp.subject_id = s.id
        WHERE sp.user_id = ?
        ORDER BY s.display_order
      `, [req.params.id]);
      res.json(progress);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // --- Parent: Subject Progress ---
  server.get('/api/parent/subject-progress', authenticateToken, async (req, res) => {
    try {
      const db = await getDb();
      const parent = await db.get('SELECT mapped_student_id FROM "user" WHERE id = ?', [req.user.id]);
      if (!parent || !parent.mapped_student_id) return res.json([]);
      const progress = await db.all(`
        SELECT sp.*, s.name as subject_name, s.icon, s.color, s.code
        FROM subject_progress sp
        JOIN subject s ON sp.subject_id = s.id
        WHERE sp.user_id = ?
        ORDER BY s.display_order
      `, [parent.mapped_student_id]);
      res.json(progress);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });


  // ==================== START SERVER ====================

  server.listen(PORT, "0.0.0.0", (err) => {
    if (err) throw err;
    console.log(`\n> ✅ Backend API Server Ready at http://localhost:${PORT}`);
    console.log(`> 🌐 Please ensure your Next.js frontend (npm run dev) is running on http://localhost:3000\n`);
  });


})();