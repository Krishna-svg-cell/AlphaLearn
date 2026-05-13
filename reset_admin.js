const { getDb, initDb } = require('./db.js');
const bcrypt = require('bcryptjs');

async function resetAdmin() {
  await initDb();
  const db = await getDb();
  const username = 'admin';
  const password = 'admin123';
  
  const hash = await bcrypt.hash(password, 10);
  
  const user = await db.get('SELECT id FROM "user" WHERE username = ?', [username]);
  
  if (user) {
    await db.run('UPDATE "user" SET password = ? WHERE id = ?', [hash, user.id]);
    console.log('✅ Admin password reset to "admin123"');
  } else {
    await db.run('INSERT INTO "user" (username, password, role) VALUES (?, ?, ?)', [username, hash, 'ADMIN']);
    console.log('✅ Admin user created with password "admin123"');
  }
  process.exit(0);
}

resetAdmin().catch(err => {
  console.error(err);
  process.exit(1);
});
