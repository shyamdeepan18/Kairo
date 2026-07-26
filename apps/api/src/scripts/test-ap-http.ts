async function run() {
  try {
    const loginRes = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@sega.com', password: 'password' })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    
    console.log('Got token');

    const itemsRes = await fetch('http://localhost:3000/api/masters/items', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Items Res:', itemsRes.status);

    const apRes = await fetch('http://localhost:3000/api/reports/ap-aging', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const apData = await apRes.json();
    console.log('AP Res:', apRes.status, apData);
  } catch (error: any) {
    console.error('Error:', error);
  }
}
run();
