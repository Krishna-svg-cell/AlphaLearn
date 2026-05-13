const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { Pool, types } = require('pg');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const dns = require('dns');

// ---- CRITICAL FIX: Force pg to return DATE columns as plain 'YYYY-MM-DD' strings ----
// Without this, pg returns Date objects that serialize with timezone offsets
// (e.g., "2026-05-07T18:30:00.000Z" instead of "2026-05-07"), breaking date comparisons.
types.setTypeParser(1082, (val) => val);  // 1082 = DATE OID
types.setTypeParser(1114, (val) => val); // 1114 = TIMESTAMP WITHOUT TZ
types.setTypeParser(1184, (val) => val); // 1184 = TIMESTAMPTZ

// ---- DNS FIX: Use Google DNS to resolve Neon hostnames ----
// Some ISP DNS servers (e.g., 10.133.40.12) refuse queries for Neon's *.neon.tech domains.
// Google DNS (8.8.8.8) resolves them correctly. We use a custom resolver and override
// the default lookup function so pg connects using Google DNS resolution.
const googleResolver = new dns.Resolver();
googleResolver.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

function googleDnsLookup(hostname, options, callback) {
  // If options is a function (older Node.js signature), adjust arguments
  if (typeof options === 'function') { callback = options; options = {}; }
  googleResolver.resolve4(hostname, (err, addresses) => {
    if (err) {
      // Fallback to system DNS if Google DNS also fails
      dns.lookup(hostname, options, callback);
    } else {
      callback(null, addresses[0], 4);
    }
  });
}

let pool;
let resolvedHost = null;

function parseDbUrl() {
  let cs = process.env.DATABASE_URL;
  if (!cs) { console.error('❌ DATABASE_URL not set!'); process.exit(1); }
  // Strip channel_binding param — pg library doesn't support it and it causes handshake timeouts
  cs = cs.replace(/[&?]channel_binding=[^&]*/gi, '');
  const parsed = new URL(cs);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port) || 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  };
}

// Resolve hostname using Google DNS (bypasses ISP DNS blocks)
async function resolveWithGoogleDns(hostname) {
  return new Promise((resolve) => {
    googleResolver.resolve4(hostname, (err, addresses) => {
      if (!err && addresses && addresses.length > 0) {
        console.log(`✅ Google DNS resolved ${hostname} → ${addresses[0]}`);
        resolve(addresses[0]);
      } else {
        // Fallback: try system DNS anyway
        console.warn(`⚠️ Google DNS failed, trying system DNS for ${hostname}...`);
        dns.lookup(hostname, (err2, address) => {
          if (!err2 && address) {
            console.log(`✅ System DNS resolved ${hostname} → ${address}`);
            resolve(address);
          } else {
            console.warn(`⚠️ System DNS also failed. Using hostname directly.`);
            resolve(hostname); // Last resort: let pg try the hostname
          }
        });
      }
    });
  });
}

async function getPool() {
  if (!pool) {
    const cfg = parseDbUrl();
    
    // Resolve the hostname to an IP using Google DNS
    // This bypasses ISP DNS servers that refuse Neon queries
    if (!resolvedHost) {
      console.log('🔌 Resolving', cfg.host, 'via Google DNS (8.8.8.8)...');
      resolvedHost = await resolveWithGoogleDns(cfg.host);
    }
    
    pool = new Pool({
      host: resolvedHost,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      max: 5,                      // Neon free-tier can't handle 20 concurrent connections
      idleTimeoutMillis: 30000,    // Keep connections alive longer to avoid cold-starts
      connectionTimeoutMillis: 15000, // Allow more time for Neon cold-start (can take 3-5s)
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      ssl: { rejectUnauthorized: false, servername: cfg.host }, // SNI uses original hostname
    });
    
    pool.on('error', (err) => {
      console.error('❌ Pool error:', err.message);
      // Don't crash — the pool will create new connections on next query
    });
    console.log('✅ PostgreSQL pool created (max: 5, keepAlive: true)');

    // Warm up the pool by pre-connecting one client
    // This prevents the first API request from triggering a cold-start
    pool.query('SELECT 1').catch(() => {});
  }
  return pool;
}

// --- SQL Conversion: SQLite → PostgreSQL ---

function convertSql(sql) {
  let r = sql;
  // INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
  const isIgnore = /INSERT\s+OR\s+IGNORE/i.test(r);
  r = r.replace(/INSERT\s+OR\s+IGNORE\s+/gi, 'INSERT ');
  // ? → $1, $2, $3...
  let i = 0;
  r = r.replace(/\?/g, () => `$${++i}`);
  
  // Quote 'user' table (reserved word in PostgreSQL)
  // Must handle: FROM user, JOIN user, INTO user, UPDATE user, TABLE user, EXISTS user
  // But NOT: user_id, users, username, target_user_id, etc.
  r = r.replace(/\buser\b(?!_|s\b|name)/gi, (match, offset) => {
    // Check what comes before this 'user' — if it's a column name char, skip
    const before = r.substring(Math.max(0, offset - 1), offset);
    if (before.match(/[a-zA-Z0-9_]/)) return match; // Part of a longer identifier like target_user
    return '"user"';
  });
  
  // Fix double-quoting: if already quoted as "user", don't re-quote
  r = r.replace(/""user""/g, '"user"');
  // Fix cases where we accidentally quoted inside string literals or aliases
  // Ensure we don't break "user".id patterns — they should stay as "user".id
  
  // Fix boolean comparisons
  r = r.replace(/is_correct\s*=\s*1/g, 'is_correct = true');
  r = r.replace(/is_correct\s*=\s*0/g, 'is_correct = false');
  r = r.replace(/is_completed\s*=\s*1/g, 'is_completed = true');
  r = r.replace(/is_completed\s*=\s*0/g, 'is_completed = false');
  // SQLite RANDOM() → PostgreSQL random()
  r = r.replace(/RANDOM\(\)/gi, 'random()');
  // Append ON CONFLICT DO NOTHING for INSERT OR IGNORE
  if (isIgnore) {
    r = r.trimEnd().replace(/;$/, '');
    // Detect target table for smarter ON CONFLICT
    if (/INTO\s+"?daily_mission"?/i.test(r)) {
      r += ' ON CONFLICT (user_id, date) DO NOTHING';
    } else if (/INTO\s+"?badge"?/i.test(r)) {
      r += ' ON CONFLICT DO NOTHING';
    } else {
      r += ' ON CONFLICT DO NOTHING';
    }
  }
  return r;
}

// --- SQLite-Compatible API ---
// Returns an object with get/all/run methods matching the sqlite package API.
// This means server.js needs almost ZERO changes.
// Added RETRY logic for Neon connection drops.

async function queryWithRetry(pool, sql, params, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await pool.query(sql, params);
    } catch (err) {
      const msg = (err.message || '').toLowerCase();
      const isConnectionError =
        msg.includes('connection terminated') ||
        msg.includes('connection refused') ||
        msg.includes('connection reset') ||
        msg.includes('timeout') ||
        msg.includes('econnreset') ||
        msg.includes('socket hang up') ||
        msg.includes('client has encountered a connection error') ||
        err.code === 'ECONNRESET' ||
        err.code === 'ECONNREFUSED' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ENOTFOUND' ||
        err.code === '57P01' ||  // admin_shutdown
        err.code === '57P03' ||  // cannot_connect_now
        err.code === '08006' ||  // connection_failure
        err.code === '08003' ||  // connection_does_not_exist
        err.code === '08001';    // sqlclient_unable_to_establish_sqlconnection
      
      if (isConnectionError && attempt < retries) {
        const delay = 1000 * (attempt + 1); // 1s, 2s, 3s exponential backoff
        console.warn(`⚠️ DB connection error (attempt ${attempt + 1}/${retries + 1}): ${err.message || err.code}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      // Log non-connection errors for debugging
      if (!isConnectionError) {
        console.error(`❌ DB query error (non-retryable): ${err.message}`);
        console.error(`   SQL: ${sql.substring(0, 200)}`);
      }
      throw err;
    }
  }
}

async function getDb() {
  const p = await getPool();
  return {
    async get(sql, params = []) {
      const { rows } = await queryWithRetry(p, convertSql(sql), params);
      return rows[0] || null;
    },
    async all(sql, params = []) {
      const { rows } = await queryWithRetry(p, convertSql(sql), params);
      return rows;
    },
    async run(sql, params = []) {
      let pgSql = convertSql(sql);
      // Auto-add RETURNING id for INSERT to support result.lastID
      if (/^\s*INSERT/i.test(pgSql) && !/RETURNING/i.test(pgSql)) {
        pgSql = pgSql.trimEnd().replace(/;$/, '') + ' RETURNING id';
      }
      const result = await queryWithRetry(p, pgSql, params);
      return { lastID: result.rows?.[0]?.id, changes: result.rowCount };
    },
  };
}

// --- Schema Init ---

async function initDb() {
  const p = await getPool();
  
  // Retry wrapper for transient DNS/network failures (Neon free-tier can be flaky)
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await p.query('SELECT 1');
      break;
    } catch (err) {
      const isTransient = err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || 
                          err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' ||
                          err.message.includes('Connection terminated');
      if (isTransient && attempt < MAX_RETRIES) {
        console.warn(`⚠️ DB connection failed (attempt ${attempt}/${MAX_RETRIES}): ${err.message}. Retrying in ${attempt * 3}s...`);
        await new Promise(r => setTimeout(r, attempt * 3000));
        continue;
      }
      console.error(`❌ Could not connect to database after ${attempt} attempts: ${err.message}`);
      throw err;
    }
  }

  const schemaPath = path.resolve(__dirname, 'schema.pg.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    try {
      await p.query(schema);
      console.log('✅ PostgreSQL schema initialized');
    } catch (err) {
      if (err.code === '42P07' || err.code === '42710') {
        console.log('ℹ️  Schema already exists, verifying migrations...');
      } else {
        console.error('❌ Schema error:', err.message);
        throw err;
      }
    }
    
    // SAFE MIGRATIONS
    try { await p.query('ALTER TABLE "user" ADD COLUMN mapped_student_id INTEGER REFERENCES "user"(id) ON DELETE SET NULL'); } catch(e) {}
    try { await p.query('ALTER TABLE "user" ADD COLUMN board_name TEXT'); } catch(e) {}
    try { await p.query('ALTER TABLE school ADD COLUMN logo_url TEXT'); } catch(e) {}
    try { await p.query('ALTER TABLE school ADD COLUMN primary_color TEXT DEFAULT \'#4f46e5\''); } catch(e) {}
    try { await p.query('ALTER TABLE mission_answers ADD COLUMN options_json TEXT'); } catch(e) {}
    try { await p.query('ALTER TABLE daily_mission ADD COLUMN start_time TEXT'); } catch(e) {}
    try { await p.query('ALTER TABLE daily_mission ADD COLUMN completion_time TEXT'); } catch(e) {}
    try { await p.query('ALTER TABLE daily_mission ADD COLUMN duration INTEGER'); } catch(e) {}
    // subject_chapter may have been created without content/description columns
    try { await p.query('ALTER TABLE subject_chapter ADD COLUMN content TEXT'); } catch(e) {}
    try { await p.query('ALTER TABLE subject_chapter ADD COLUMN description TEXT'); } catch(e) {}
  }

  // Create default admin if not exists
  const { rows } = await p.query('SELECT id FROM "user" WHERE username = $1', ['admin']);
  if (rows.length === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await p.query('INSERT INTO "user" (username, password, role) VALUES ($1, $2, $3)', ['admin', hash, 'ADMIN']);
    console.log('✅ Default admin created (admin / admin123)');
  }

  // ==================== ENSURE SCHOOL EXISTS ====================
  let defaultSchoolId = null;
  const { rows: existingSchools } = await p.query('SELECT id FROM school ORDER BY id ASC LIMIT 1');
  if (existingSchools.length > 0) {
    defaultSchoolId = existingSchools[0].id;
  } else {
    const res = await p.query('INSERT INTO school (name, address) VALUES ($1, $2) RETURNING id', ['AlphaLearn Academy', '123 Education Way']);
    defaultSchoolId = res.rows[0].id;
    console.log('✅ Default School created (id: ' + defaultSchoolId + ')');
  }

  // ==================== FIX ORPHANED USERS ====================
  const { rowCount: fixedCount } = await p.query(
    'UPDATE "user" SET school_id = $1 WHERE school_id IS NULL AND role != $2',
    [defaultSchoolId, 'ADMIN']
  );
  if (fixedCount > 0) {
    console.log(`✅ Fixed ${fixedCount} orphaned user(s) → assigned to school ${defaultSchoolId}`);
  }


  // ==================== FIX PARENT MAPPINGS ====================
  const { rows: unmappedParents } = await p.query(
    'SELECT id, school_id FROM "user" WHERE role = $1 AND mapped_student_id IS NULL',
    ['PARENT']
  );
  for (const parent of unmappedParents) {
    const { rows: students } = await p.query(
      'SELECT id FROM "user" WHERE role = $1 AND school_id = $2 ORDER BY id ASC LIMIT 1',
      ['STUDENT', parent.school_id]
    );
    if (students.length > 0) {
      await p.query('UPDATE "user" SET mapped_student_id = $1 WHERE id = $2', [students[0].id, parent.id]);
      console.log(`✅ Mapped parent (id: ${parent.id}) → student (id: ${students[0].id})`);
    }
  }

  // ==================== SEED DEFAULT SUBJECTS ====================
  const defaultSubjects = [
    ['English','ENG','📖','#4f46e5','language',1],
    ['Mathematics','MATH','🔢','#059669','core',2],
    ['Science','SCI','🔬','#0891b2','core',3],
    ['Physics','PHY','⚡','#7c3aed','core',4],
    ['Chemistry','CHEM','🧪','#dc2626','core',5],
    ['Biology','BIO','🧬','#16a34a','core',6],
    ['Social Studies','SST','🌍','#ca8a04','core',7],
    ['History','HIST','🏛️','#b45309','core',8],
    ['Geography','GEO','🗺️','#0d9488','core',9],
    ['Political Science','POL','⚖️','#6366f1','core',10],
    ['Computer Science','CS','💻','#2563eb','core',11],
    ['Economics','ECO','📈','#9333ea','core',12],
    ['Commerce','COM','🏪','#ea580c','core',13],
    ['Accountancy','ACC','📊','#0284c7','core',14],
    ['Business Studies','BIZ','💼','#4338ca','core',15],
    ['Environmental Studies','EVS','🌱','#15803d','core',16],
    ['Hindi','HIN','🇮🇳','#e11d48','language',17],
    ['Kannada','KAN','📜','#b91c1c','language',18],
    ['General Knowledge','GK','💡','#f59e0b','elective',19],
  ];
  for (const [name, code, icon, color, category, order] of defaultSubjects) {
    try {
      await p.query(
        'INSERT INTO subject (name, code, icon, color, category, display_order, is_system) VALUES ($1,$2,$3,$4,$5,$6,TRUE) ON CONFLICT (code) DO NOTHING',
        [name, code, icon, color, category, order]
      );
    } catch(e) {}
  }
  const { rows: subjectCount } = await p.query('SELECT COUNT(*) as count FROM subject');
  console.log(`✅ Subjects seeded (${subjectCount[0]?.count || 0} total)`);

  // ==================== AUTO-ENABLE ALL SUBJECTS FOR ALL SCHOOLS ====================
  // Enable every system subject for Grades 1-12 on all schools (idempotent)
  const { rows: allSchools } = await p.query('SELECT id FROM school');
  const { rows: allSystemSubjects } = await p.query('SELECT id FROM subject WHERE is_system = true');
  const classes = ['1','2','3','4','5','6','7','8','9','10','11','12'];
  let enabledCount = 0;
  for (const school of allSchools) {
    for (const sub of allSystemSubjects) {
      for (const cls of classes) {
        try {
          const { rows: exists } = await p.query(
            'SELECT id FROM school_subject WHERE school_id = $1 AND subject_id = $2 AND class_name = $3 LIMIT 1',
            [school.id, sub.id, cls]
          );
          if (exists.length === 0) {
            await p.query(
              'INSERT INTO school_subject (school_id, subject_id, class_name, is_enabled, is_mandatory) VALUES ($1, $2, $3, true, true)',
              [school.id, sub.id, cls]
            );
            enabledCount++;
          }
        } catch(e) {}
      }
    }
  }
  if (enabledCount > 0) console.log(`✅ Auto-enabled ${enabledCount} subject-class configs across ${allSchools.length} school(s)`);

  // Log final state
  const { rows: userSummary } = await p.query(
    'SELECT role, COUNT(*) as count FROM "user" GROUP BY role ORDER BY role'
  );
  console.log('✅ Database ready — Users:', userSummary.map(r => `${r.role}:${r.count}`).join(', '));
}


async function closePool() {
  if (pool) { await pool.end(); pool = null; }
}

module.exports = { getDb, initDb, closePool, getPool, convertSql };
