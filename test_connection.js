// Diagnostic script to test Neon DB connectivity
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const dns = require('dns');
const { Pool } = require('pg');

const cs = process.env.DATABASE_URL;
console.log('\n=== RAW DATABASE_URL ===');
console.log(cs);
console.log('Length:', cs.length);

// Check for hidden characters
console.log('\n=== CHARACTER INSPECTION (hostname portion) ===');
const parsed = new URL(cs.replace(/[&?]channel_binding=[^&]*/gi, ''));
const host = parsed.hostname;
console.log('Parsed hostname:', host);
console.log('Hostname length:', host.length);
console.log('Hostname chars:', [...host].map((c, i) => `${i}:'${c}'(${c.charCodeAt(0)})`).join(' '));

// Check for double dots
if (host.includes('..')) {
  console.log('\n❌ DOUBLE DOT FOUND IN HOSTNAME!');
} else {
  console.log('\n✅ No double dots in hostname');
}

// DNS lookup
console.log('\n=== DNS RESOLUTION TEST ===');
dns.lookup(host, (err, address, family) => {
  if (err) {
    console.log('❌ DNS lookup FAILED:', err.message);
    console.log('   This means the hostname does not exist or your network cannot reach it.');
    console.log('\n=== TRYING WITHOUT -pooler.c-2 ===');
    // Try the direct (non-pooler) endpoint
    const directHost = host.replace('-pooler', '').replace('.c-2.', '.');
    console.log('Testing:', directHost);
    dns.lookup(directHost, (err2, addr2) => {
      if (err2) {
        console.log('❌ Direct endpoint also FAILED:', err2.message);
        console.log('\n⚠️  Your Neon database may be suspended. Please check https://console.neon.tech');
      } else {
        console.log('✅ Direct endpoint resolves to:', addr2);
        console.log('\n💡 FIX: Use the direct endpoint instead of the pooler endpoint.');
      }
      process.exit(0);
    });
  } else {
    console.log('✅ DNS resolves to:', address, '(IPv' + family + ')');
    
    // Try actual PG connection
    console.log('\n=== POSTGRESQL CONNECTION TEST ===');
    const pool = new Pool({
      host: host,
      port: parseInt(parsed.port) || 5432,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, ''),
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    pool.query('SELECT NOW() as time')
      .then(res => {
        console.log('✅ CONNECTION SUCCESS! Server time:', res.rows[0].time);
        pool.end();
        process.exit(0);
      })
      .catch(err => {
        console.log('❌ CONNECTION FAILED:', err.message);
        pool.end();
        process.exit(1);
      });
  }
});
