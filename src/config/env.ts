import { createHash } from 'crypto';

const toNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = toNumber(value, fallback);
  return parsed > 0 ? Math.floor(parsed) : fallback;
};

const parseOrigins = (value: string | undefined): string[] => {
  if (!value) {
    return ['*'];
  }
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
};

const config = {
  port: toPositiveInt(process.env.PORT, 8000),
  redisUrl: process.env.REDIS_URL || '',
  redisHost: process.env.REDIS_HOST || '127.0.0.1',
  redisPort: toPositiveInt(process.env.REDIS_PORT, 6379),
  redisPassword: process.env.REDIS_PASSWORD || '',
  tokenSecret: process.env.TOKEN_SECRET || 'dev-only-change-this-secret',
  sessionTtlSec: toPositiveInt(process.env.SESSION_TTL_SEC, 24 * 60 * 60),
  roomIdleMs: toPositiveInt(process.env.ROOM_IDLE_MS, 30 * 60 * 1000),
  reconnectGraceSec: toPositiveInt(process.env.RECONNECT_GRACE_SEC, 60),
  reaperIntervalMs: toPositiveInt(process.env.REAPER_INTERVAL_MS, 5_000),
  maxWsPayloadBytes: toPositiveInt(process.env.MAX_WS_PAYLOAD_BYTES, 2_048),
  allowedOrigins: parseOrigins(process.env.WS_ALLOWED_ORIGINS),
  rateLimits: {
    connectPerMin: toPositiveInt(process.env.RATE_CONNECT_PER_MIN, 20),
    createPerMin: toPositiveInt(process.env.RATE_CREATE_PER_MIN, 3),
    joinPerMin: toPositiveInt(process.env.RATE_JOIN_PER_MIN, 15),
    switchPerMin: toPositiveInt(process.env.RATE_SWITCH_PER_MIN, 30),
    startPerMin: toPositiveInt(process.env.RATE_START_PER_MIN, 15),
    authPerMin: toPositiveInt(process.env.RATE_AUTH_PER_MIN, 30),
    invalidCodePerMin: toPositiveInt(process.env.RATE_INVALID_CODE_PER_MIN, 20),
  },
  rules: {
    maxPlayers: 12,
    maxTeamSize: 6,
    equalTeamsRequired: true,
    minTeamStart: 1,
  },
};

export const isOriginAllowed = (originHeader: string | undefined): boolean => {
  if (config.allowedOrigins.includes('*')) {
    return true;
  }
  if (!originHeader) {
    return false;
  }
  return config.allowedOrigins.includes(originHeader);
};

export const hashIp = (ip: string): string => {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
};

export default config;
