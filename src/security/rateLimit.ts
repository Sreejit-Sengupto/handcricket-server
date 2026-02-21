import { RedisLobbyRepository } from '../infra/redis/repository';

export class RateLimiter {
  private readonly repository: RedisLobbyRepository;

  constructor(repository: RedisLobbyRepository) {
    this.repository = repository;
  }

  async allow(scope: string, identifier: string, limit: number, windowMs: number): Promise<boolean> {
    if (limit <= 0) {
      return false;
    }

    return this.repository.consumeRateLimit(scope, identifier, limit, windowMs);
  }
}
