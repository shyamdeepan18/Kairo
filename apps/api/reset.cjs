const { Client } = require('pg');
const bcrypt = require('bcryptjs');

async function run() {
  const hash = await bcrypt.hash('12345678', 10);
  const client = new Client({ connectionString: 'postgres://erp:erp@localhost:5432/erp_db' });
  await client.connect();
  await client.query('UPDATE users SET password_hash = $1 WHERE email IN ($2, $3)', [hash, 'user1@g.com', 'user2@g.com']);
  await client.end();
  console.log('Done!');
}
run();
