import fp from 'fastify-plugin';
import { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

export default fp(async (app: FastifyInstance) => {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

  const redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  redis.on('error', (err) => app.log.error({ err }, 'Redis error'));

  await redis.connect();
  app.log.info('Redis connected');

  app.decorate('redis', redis);
  app.addHook('onClose', async () => {
    await redis.quit();
  });
}, { name: 'redis' });
