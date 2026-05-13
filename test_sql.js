// Quick test script for convertSql
const { convertSql } = require('./db.js');

const tests = [
  // Basic FROM user
  { input: "SELECT * FROM user WHERE id = ?", expect: '"user"' },
  // UPDATE user SET
  { input: "UPDATE user SET xp = ? WHERE id = ?", expect: '"user"' },
  // JOIN user
  { input: "SELECT u.* FROM user u LEFT JOIN school s ON u.school_id = s.id", expect: '"user"' },
  // Should NOT touch user_id
  { input: "SELECT user_id FROM daily_mission", expectNot: '"user"_id' },
  // Should NOT touch username
  { input: "SELECT username FROM user WHERE id = ?", expect: '"user"' },
  // Should NOT touch target_user_id  
  { input: "WHERE target_user_id = ?", expectNot: 'target_"user"_id' },
  // Subquery with user
  { input: "SELECT id FROM user WHERE role = 'PARENT'", expect: '"user"' },
  // INSERT INTO user
  { input: "INSERT INTO user (username) VALUES (?)", expect: '"user"' },
  // mapped_student_id — should NOT be affected
  { input: "SELECT mapped_student_id FROM user", expect: '"user"' },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  const result = convertSql(t.input);
  if (t.expect && result.includes(t.expect)) {
    console.log(`✅ PASS: "${t.input.substring(0, 50)}..." → contains "${t.expect}"`);
    passed++;
  } else if (t.expectNot && !result.includes(t.expectNot)) {
    console.log(`✅ PASS: "${t.input.substring(0, 50)}..." → does NOT contain "${t.expectNot}"`);
    passed++;
  } else {
    console.log(`❌ FAIL: "${t.input}" → "${result}"`);
    if (t.expect) console.log(`   Expected to contain: "${t.expect}"`);
    if (t.expectNot) console.log(`   Expected NOT to contain: "${t.expectNot}"`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
