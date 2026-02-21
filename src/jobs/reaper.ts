import { LobbyService } from '../services/lobbyService';
import { logSystem } from '../utils/logger';

export const startReaper = (service: LobbyService, intervalMs: number): NodeJS.Timeout => {
  return setInterval(async () => {
    try {
      await service.runReaperBatch(Date.now());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      logSystem('Reaper iteration failed', { error: message });
    }
  }, intervalMs);
};
