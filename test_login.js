const { getDb, initDb } = require('./db.js');
const bcrypt = require('bcryptjs');

async function testLogin() {
  await initDb();
  const db = await getDb();
  const username = 'admin';
  const password = 'admin123';
  
  const user = await db.get('SELECT u.*, s.name as school_name FROM user u LEFT JOIN school s ON u.school_id = s.id WHERE u.username = ?', [username]);
  console.log('User found:', user);
  
  if (user) {
    const isMatch = await bcrypt.compare(password, user.password);
    console.log('Password match:', isMatch);
  }
  process.exit(0);
}

testLogin().catch(err => {
  console.error(err);
  process.exit(1);
});
