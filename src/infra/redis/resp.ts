import Redis from 'ioredis';

type RedisScalar = string | number | null;
export type RedisValue = RedisScalar | RedisValue[];

export interface RedisConnectionOptions {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
}

const normalizeRedisUrl = (url: string): string => {
  if (url.startsWith('ediss://')) {
    return url.replace(/^ediss:\/\//, 'rediss://');
  }
  return url;
};

const createRedisClient = (options: RedisConnectionOptions): Redis => {
  if (options.url) {
    return new Redis(normalizeRedisUrl(options.url), {
      lazyConnect: true,
    });
  }

  return new Redis({
    host: options.host || '127.0.0.1',
    port: options.port || 6379,
    password: options.password || undefined,
    lazyConnect: true,
  });
};

export class RedisConnection {
  private readonly client: Redis;

  constructor(options: RedisConnectionOptions) {
    this.client = createRedisClient(options);
  }

  async connect(): Promise<void> {
    if (this.client.status === 'ready' || this.client.status === 'connect') {
      return;
    }

    if (this.client.status === 'connecting' || this.client.status === 'reconnecting') {
      await new Promise<void>((resolve) => {
        this.client.once('ready', () => resolve());
      });
      return;
    }

    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  async command(args: string[]): Promise<RedisValue> {
    if (args.length === 0) {
      throw new Error('Redis command cannot be empty');
    }

    const [command, ...commandArgs] = args;
    const response = await this.client.call(command, ...commandArgs);
    return response as RedisValue;
  }

  getClient(): Redis {
    return this.client;
  }
}

export class RedisCommands {
  private readonly client: Redis;

  constructor(connection: RedisConnection) {
    this.client = connection.getClient();
  }

  async eval(script: string, keys: string[], args: string[]): Promise<RedisValue> {
    const response = await this.client.eval(script, keys.length, ...keys, ...args);
    return response as RedisValue;
  }

  async publish(channel: string, payload: string): Promise<number> {
    return this.client.publish(channel, payload);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async scard(key: string): Promise<number> {
    return this.client.scard(key);
  }

  async zcard(key: string): Promise<number> {
    return this.client.zcard(key);
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zrange(key, start, stop);
  }

  async zrangeByScore(
    key: string,
    min: number | string,
    max: number | string,
    limit: number,
  ): Promise<string[]> {
    return this.client.zrangebyscore(key, String(min), String(max), 'LIMIT', 0, limit);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }
}

export interface SubscriberMessage {
  pattern: string;
  channel: string;
  payload: string;
}

export class RedisSubscriber {
  private readonly client: Redis;

  private handler: ((message: SubscriberMessage) => void) | null = null;

  constructor(options: RedisConnectionOptions) {
    this.client = createRedisClient(options);

    this.client.on('pmessage', (pattern: string, channel: string, payload: string) => {
      if (!this.handler) {
        return;
      }

      this.handler({
        pattern,
        channel,
        payload,
      });
    });
  }

  async connect(): Promise<void> {
    if (this.client.status === 'ready' || this.client.status === 'connect') {
      return;
    }

    if (this.client.status === 'connecting' || this.client.status === 'reconnecting') {
      await new Promise<void>((resolve) => {
        this.client.once('ready', () => resolve());
      });
      return;
    }

    await this.client.connect();
  }

  async psubscribe(pattern: string, handler: (message: SubscriberMessage) => void): Promise<void> {
    this.handler = handler;
    await this.client.psubscribe(pattern);
  }
}
