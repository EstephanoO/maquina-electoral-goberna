import { pool } from '../src/db';

async function main() {
  const user = await pool.query("SELECT id, email, role FROM users WHERE email = 'david@gmail.com'");
  console.log('User:', user.rows[0]);
  
  await pool.query("UPDATE users SET role = 'admin' WHERE email = 'david@gmail.com'");
  console.log('Updated to admin');
  
  const updated = await pool.query("SELECT id, email, role FROM users WHERE email = 'david@gmail.com'");
  console.log('After update:', updated.rows[0]);
  
  await pool.end();
}
main();
