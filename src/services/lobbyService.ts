import config from '../config/env';
import { RedisLobbyRepository } from '../infra/redis/repository';
import { verifySessionToken, issueSessionToken } from '../security/token';
import { ErrorCode, SessionClaims } from '../types/domain';
import { generatePid, generateRoomCode, generateSid, chooseDefaultTeam } from '../utils/ids';

interface ServiceSuccess<T> {
  ok: true;
  data: T;
}

interface ServiceFailure {
  ok: false;
  code: ErrorCode;
}

type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;

const mapScriptCode = (code: string): ErrorCode => {
  switch (code) {
    case 'ROOM_EXISTS':
      return 'ROOM_EXISTS';
    case 'ROOM_NOT_FOUND':
      return 'ROOM_NOT_FOUND';
    case 'ROOM_FULL':
      return 'ROOM_FULL';
    case 'TEAM_FULL':
      return 'TEAM_FULL';
    case 'ROOM_LOCKED':
      return 'ROOM_LOCKED';
    case 'ALREADY_IN_ROOM':
      return 'ALREADY_IN_ROOM';
    case 'NOT_IN_ROOM':
      return 'NOT_IN_ROOM';
    case 'PLAYER_NOT_ACTIVE':
      return 'PLAYER_NOT_ACTIVE';
    case 'ONLY_HOST':
      return 'ONLY_HOST';
    case 'TEAMS_NOT_EQUAL':
      return 'TEAMS_NOT_EQUAL';
    case 'MIN_PLAYERS_NOT_MET':
      return 'MIN_PLAYERS_NOT_MET';
    case 'RESERVED_PENDING':
      return 'RESERVED_PENDING';
    case 'NOT_RESERVED':
      return 'NOT_RESERVED';
    case 'RESERVATION_EXPIRED':
      return 'RESERVATION_EXPIRED';
    default:
      return 'INTERNAL_ERROR';
  }
};

export class LobbyService {
  private readonly repository: RedisLobbyRepository;

  private readonly tokenSecret: string;

  constructor(repository: RedisLobbyRepository) {
    this.repository = repository;
    this.tokenSecret = config.tokenSecret;
  }

  async createRoom(displayName: string, preferredTeam: 'A' | 'B' | null): Promise<ServiceResult<{
    token: string;
    claims: SessionClaims;
  }>> {
    const pid = generatePid();
    const sid = generateSid();
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const exp = nowSec + config.sessionTtlSec;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const roomCode = generateRoomCode();
      const team = chooseDefaultTeam(preferredTeam);

      const result = await this.repository.createRoom({
        roomCode,
        pid,
        displayName,
        team,
        sid,
        nowMs,
        sessionExp: exp,
        sessionTtlMs: config.sessionTtlSec * 1000,
        maxPlayers: config.rules.maxPlayers,
        maxTeamSize: config.rules.maxTeamSize,
        minTeamStart: config.rules.minTeamStart,
        graceSec: config.reconnectGraceSec,
        equalTeamsRequired: config.rules.equalTeamsRequired,
      });

      if (!result.ok && result.code === 'ROOM_EXISTS') {
        continue;
      }

      if (!result.ok) {
        return {
          ok: false,
          code: mapScriptCode(result.code),
        };
      }

      const claims: SessionClaims = {
        sid,
        pid,
        roomCode,
        role: 'HOST',
        exp,
      };

      const token = issueSessionToken(claims, this.tokenSecret);

      return {
        ok: true,
        data: {
          token,
          claims,
        },
      };
    }

    return {
      ok: false,
      code: 'INTERNAL_ERROR',
    };
  }

  async joinRoom(
    roomCode: string,
    displayName: string,
    preferredTeam: 'A' | 'B',
  ): Promise<ServiceResult<{ token: string; claims: SessionClaims }>> {
    const pid = generatePid();
    const sid = generateSid();
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const exp = nowSec + config.sessionTtlSec;

    const result = await this.repository.joinRoom({
      roomCode,
      pid,
      displayName,
      team: preferredTeam,
      sid,
      nowMs,
      sessionExp: exp,
      sessionTtlMs: config.sessionTtlSec * 1000,
      maxPlayers: config.rules.maxPlayers,
      maxTeamSize: config.rules.maxTeamSize,
    });

    if (!result.ok) {
      return {
        ok: false,
        code: mapScriptCode(result.code),
      };
    }

    const claims: SessionClaims = {
      sid,
      pid,
      roomCode,
      role: 'PLAYER',
      exp,
    };

    const token = issueSessionToken(claims, this.tokenSecret);

    return {
      ok: true,
      data: {
        token,
        claims,
      },
    };
  }

  async resumeSession(token: string): Promise<ServiceResult<{ claims: SessionClaims }>> {
    const nowSec = Math.floor(Date.now() / 1000);
    const verified = verifySessionToken(token, this.tokenSecret, nowSec);
    if (!verified.ok) {
      return {
        ok: false,
        code: verified.code,
      };
    }

    const claims = verified.claims;
    const session = await this.repository.getSession(claims.sid);

    if (!session) {
      return {
        ok: false,
        code: 'SESSION_NOT_FOUND',
      };
    }

    if (session.revoked) {
      return {
        ok: false,
        code: 'SESSION_REVOKED',
      };
    }

    if (
      session.pid !== claims.pid ||
      session.roomCode !== claims.roomCode ||
      session.role !== claims.role
    ) {
      return {
        ok: false,
        code: 'SESSION_MISMATCH',
      };
    }

    if (session.exp <= nowSec) {
      return {
        ok: false,
        code: 'TOKEN_EXPIRED',
      };
    }

    const result = await this.repository.resumeReconnect(
      claims.roomCode,
      claims.pid,
      claims.sid,
      Date.now(),
    );

    if (!result.ok) {
      const mapped = mapScriptCode(result.code);
      if (mapped === 'NOT_RESERVED') {
        return {
          ok: false,
          code: 'NOT_RESERVED',
        };
      }
      return {
        ok: false,
        code: mapped,
      };
    }

    return {
      ok: true,
      data: {
        claims,
      },
    };
  }

  async switchTeam(auth: SessionClaims, targetTeam: 'A' | 'B'): Promise<ServiceResult<null>> {
    const result = await this.repository.switchTeam(
      auth.roomCode,
      auth.pid,
      targetTeam,
      Date.now(),
      config.rules.maxTeamSize,
    );

    if (!result.ok) {
      return {
        ok: false,
        code: mapScriptCode(result.code),
      };
    }

    return {
      ok: true,
      data: null,
    };
  }

  async startRoom(auth: SessionClaims): Promise<ServiceResult<{ lockedAt: number }>> {
    if (auth.role !== 'HOST') {
      return {
        ok: false,
        code: 'ONLY_HOST',
      };
    }

    const nowMs = Date.now();
    const result = await this.repository.startRoom(
      auth.roomCode,
      auth.pid,
      nowMs,
      config.rules.minTeamStart,
      config.rules.equalTeamsRequired,
    );

    if (!result.ok) {
      return {
        ok: false,
        code: mapScriptCode(result.code),
      };
    }

    return {
      ok: true,
      data: {
        lockedAt: nowMs,
      },
    };
  }

  async holdDisconnect(auth: SessionClaims): Promise<ServiceResult<null>> {
    const nowMs = Date.now();
    const expiryMs = nowMs + config.reconnectGraceSec * 1000;

    const result = await this.repository.holdDisconnect(auth.roomCode, auth.pid, nowMs, expiryMs);
    if (!result.ok) {
      return {
        ok: false,
        code: mapScriptCode(result.code),
      };
    }

    return {
      ok: true,
      data: null,
    };
  }

  async getSnapshot(roomCode: string) {
    return this.repository.getRoomSnapshot(roomCode);
  }

  async runReaperBatch(nowMs: number): Promise<void> {
    const expired = await this.repository.listExpiredReservations(nowMs, 100);
    for (const entry of expired) {
      await this.repository.expireReserved(entry.roomCode, entry.pid, nowMs);
    }

    const rooms = await this.repository.listRooms();
    for (const roomCode of rooms) {
      const updatedAt = await this.repository.getRoomUpdatedAt(roomCode);
      if (updatedAt <= 0) {
        continue;
      }

      if (nowMs - updatedAt > config.roomIdleMs) {
        await this.repository.cleanupIdleRoom(roomCode);
      }
    }
  }
}
