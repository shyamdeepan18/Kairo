const require = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
};

export const config = {
  port: parseInt(process.env.API_PORT ?? '3000'),
  host: process.env.API_HOST ?? '0.0.0.0',
  isProd: process.env.NODE_ENV === 'production',

  jwt: {
    secret: require('JWT_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresDays: parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? '7'),
  },

  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  },
} as const;
