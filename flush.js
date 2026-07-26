import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
async function flush() {
  const keys = await redis.keys('perms:*');
  if (keys.length > 0) {
    await redis.del(...keys);
    console.log('Flushed', keys.length, 'keys');
  } else {
    console.log('No keys to flush');
  }
  process.exit(0);
}
flush().catch(console.error);
