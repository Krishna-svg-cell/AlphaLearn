const { getPool } = require('./db');
getPool().query('SELECT username, role, password FROM "user"').then(res => console.log(res.rows)).catch(console.error).finally(() => process.exit(0));
