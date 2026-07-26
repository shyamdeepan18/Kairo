import { app } from '../index.js';

async function run() {
  await app.ready();
  
  // Create a token directly
  const token = await app.jwt.sign(
    {
      sub: 'a978a835-e449-4580-80fc-b7f0bb54e9d2',
      sessionId: 'test-session',
      email: 'admin@sega.com',
      fullName: 'Admin',
      isSystemAdmin: true,
    },
    { expiresIn: '15m' }
  );

  const res = await app.inject({
    method: 'GET',
    url: '/api/reports/ar-aging',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  console.log('Status:', res.statusCode);
  console.log('Body:', res.body);
  process.exit(0);
}
run();
