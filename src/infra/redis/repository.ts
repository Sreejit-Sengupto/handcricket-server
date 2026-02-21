import { keys } from './keys';
import {
  CLEANUP_IDLE_ROOM_SCRIPT,
  DISCONNECT_HOLD_SCRIPT,
  EXPIRE_RESERVED_SCRIPT,
  RATE_LIMIT_SCRIPT,
  RESUME_RECONNECT_SCRIPT,
  ROOM_CREATE_SCRIPT,
  ROOM_JOIN_SCRIPT,
  ROOM_START_SCRIPT,
  TEAM_SWITCH_SCRIPT,
} from './scripts';
import { RedisCommands, RedisValue } from './resp';
import { RoomSnapshot, SessionRecord } from '../../types/domain';

interface ScriptResult {
  ok: boolean;
  code: string;
}

interface CreateRoomInput {
  roomCode: string;
  pid: string;
  displayName: string;
  team: 'A' | 'B';
  sid: string;
  nowMs: number;
  sessionExp: number;
  sessionTtlMs: number;
  maxPlayers: number;
  maxTeamSize: number;
  minTeamStart: number;
  graceSec: number;
  equalTeamsRequired: boolean;
}

interface JoinRoomInput {
  roomCode: string;
  pid: string;
  displayName: string;
  team: 'A' | 'B';
  sid: string;
  nowMs: number;
  sessionExp: number;
  sessionTtlMs: number;
  maxPlayers: number;
  maxTeamSize: number;
}

const toNumber = (value: string | undefined, fallback = 0): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseScriptResult = (reply: RedisValue): ScriptResult => {
  if (Array.isArray(reply) && reply.length >= 2) {
    const okRaw = reply[0];
    const codeRaw = reply[1];

    const ok = typeof okRaw === 'number'
      ? okRaw === 1
      : typeof okRaw === 'string' && okRaw === '1';

    return {
      ok,
      code: typeof codeRaw === 'string' ? codeRaw : 'INTERNAL_ERROR',
    };
  }

  return {
    ok: false,
    code: 'INTERNAL_ERROR',
  };
};

export class RedisLobbyRepository {
  private readonly redis: RedisCommands;

  constructor(redis: RedisCommands) {
    this.redis = redis;
  }

  async createRoom(input: CreateRoomInput): Promise<ScriptResult> {
    const roomCode = input.roomCode;
    const result = await this.redis.eval(
      ROOM_CREATE_SCRIPT,
      [
        keys.room(roomCode),
        keys.roomTeamA(roomCode),
        keys.roomTeamB(roomCode),
        keys.roomActive(roomCode),
        keys.roomReserved(roomCode),
        keys.roomJoinOrder(roomCode),
        keys.roomSeq(roomCode),
        keys.roomPlayersSet(roomCode),
        keys.player(roomCode, input.pid),
        keys.session(input.sid),
        keys.roomsIndex,
      ],
      [
        roomCode,
        input.pid,
        input.displayName,
        input.team,
        input.sid,
        String(input.nowMs),
        String(input.sessionExp),
        String(input.sessionTtlMs),
        String(input.maxPlayers),
        String(input.maxTeamSize),
        String(input.minTeamStart),
        String(input.graceSec),
        input.equalTeamsRequired ? '1' : '0',
      ],
    );

    return parseScriptResult(result);
  }

  async joinRoom(input: JoinRoomInput): Promise<ScriptResult> {
    const roomCode = input.roomCode;
    const result = await this.redis.eval(
      ROOM_JOIN_SCRIPT,
      [
        keys.room(roomCode),
        keys.roomTeamA(roomCode),
        keys.roomTeamB(roomCode),
        keys.roomActive(roomCode),
        keys.roomReserved(roomCode),
        keys.roomJoinOrder(roomCode),
        keys.roomSeq(roomCode),
        keys.roomPlayersSet(roomCode),
        keys.player(roomCode, input.pid),
        keys.session(input.sid),
      ],
      [
        roomCode,
        input.pid,
        input.displayName,
        input.team,
        input.sid,
        String(input.nowMs),
        String(input.sessionExp),
        String(input.sessionTtlMs),
        String(input.maxPlayers),
        String(input.maxTeamSize),
      ],
    );

    return parseScriptResult(result);
  }

  async switchTeam(roomCode: string, pid: string, targetTeam: 'A' | 'B', nowMs: number, maxTeamSize: number): Promise<ScriptResult> {
    const result = await this.redis.eval(
      TEAM_SWITCH_SCRIPT,
      [
        keys.room(roomCode),
        keys.roomTeamA(roomCode),
        keys.roomTeamB(roomCode),
        keys.roomActive(roomCode),
        keys.player(roomCode, pid),
      ],
      [pid, targetTeam, String(nowMs), String(maxTeamSize)],
    );

    return parseScriptResult(result);
  }

  async startRoom(roomCode: string, pid: string, nowMs: number, minTeamStart: number, equalTeamsRequired: boolean): Promise<ScriptResult> {
    const result = await this.redis.eval(
      ROOM_START_SCRIPT,
      [
        keys.room(roomCode),
        keys.roomTeamA(roomCode),
        keys.roomTeamB(roomCode),
        keys.roomReserved(roomCode),
      ],
      [pid, String(nowMs), String(minTeamStart), equalTeamsRequired ? '1' : '0'],
    );

    return parseScriptResult(result);
  }

  async holdDisconnect(roomCode: string, pid: string, nowMs: number, expiryMs: number): Promise<ScriptResult> {
    const result = await this.redis.eval(
      DISCONNECT_HOLD_SCRIPT,
      [
        keys.room(roomCode),
        keys.roomActive(roomCode),
        keys.roomReserved(roomCode),
        keys.player(roomCode, pid),
        keys.reservedGlobal,
      ],
      [roomCode, pid, String(nowMs), String(expiryMs)],
    );

    return parseScriptResult(result);
  }

  async resumeReconnect(roomCode: string, pid: string, sid: string, nowMs: number): Promise<ScriptResult> {
    const result = await this.redis.eval(
      RESUME_RECONNECT_SCRIPT,
      [
        keys.room(roomCode),
        keys.roomActive(roomCode),
        keys.roomReserved(roomCode),
        keys.player(roomCode, pid),
        keys.reservedGlobal,
      ],
      [roomCode, pid, sid, String(nowMs)],
    );

    return parseScriptResult(result);
  }

  async expireReserved(roomCode: string, pid: string, nowMs: number): Promise<ScriptResult> {
    const result = await this.redis.eval(
      EXPIRE_RESERVED_SCRIPT,
      [
        keys.room(roomCode),
        keys.roomTeamA(roomCode),
        keys.roomTeamB(roomCode),
        keys.roomActive(roomCode),
        keys.roomReserved(roomCode),
        keys.roomJoinOrder(roomCode),
        keys.roomSeq(roomCode),
        keys.roomPlayersSet(roomCode),
        keys.roomsIndex,
        keys.reservedGlobal,
        keys.player(roomCode, pid),
      ],
      [roomCode, pid, String(nowMs), keys.playerPrefix(roomCode)],
    );

    return parseScriptResult(result);
  }

  async cleanupIdleRoom(roomCode: string): Promise<ScriptResult> {
    const result = await this.redis.eval(
      CLEANUP_IDLE_ROOM_SCRIPT,
      [
        keys.room(roomCode),
        keys.roomTeamA(roomCode),
        keys.roomTeamB(roomCode),
        keys.roomActive(roomCode),
        keys.roomReserved(roomCode),
        keys.roomJoinOrder(roomCode),
        keys.roomSeq(roomCode),
        keys.roomPlayersSet(roomCode),
        keys.roomsIndex,
        keys.reservedGlobal,
      ],
      [roomCode, keys.playerPrefix(roomCode)],
    );

    return parseScriptResult(result);
  }

  async consumeRateLimit(scope: string, id: string, limit: number, windowMs: number): Promise<boolean> {
    const result = await this.redis.eval(
      RATE_LIMIT_SCRIPT,
      [keys.rateLimit(scope, id)],
      [String(windowMs), String(limit)],
    );

    const parsed = parseScriptResult(result);
    return parsed.ok;
  }

  async getSession(sid: string): Promise<SessionRecord | null> {
    const data = await this.redis.hgetall(keys.session(sid));
    if (Object.keys(data).length === 0) {
      return null;
    }

    return {
      sid: data.sid || '',
      pid: data.pid || '',
      roomCode: data.roomCode || '',
      role: data.role === 'HOST' ? 'HOST' : 'PLAYER',
      exp: toNumber(data.exp),
      revoked: data.revoked === '1',
    };
  }

  async getRoomSnapshot(roomCode: string): Promise<RoomSnapshot | null> {
    const roomData = await this.redis.hgetall(keys.room(roomCode));
    if (Object.keys(roomData).length === 0) {
      return null;
    }

    const [teamAIds, teamBIds, activeIds, reservedIds, joinOrder] = await Promise.all([
      this.redis.smembers(keys.roomTeamA(roomCode)),
      this.redis.smembers(keys.roomTeamB(roomCode)),
      this.redis.smembers(keys.roomActive(roomCode)),
      this.redis.zrange(keys.roomReserved(roomCode), 0, -1),
      this.redis.zrange(keys.roomJoinOrder(roomCode), 0, -1),
    ]);

    const activeSet = new Set(activeIds);
    const reservedSet = new Set(reservedIds);
    const orderMap = new Map<string, number>();
    joinOrder.forEach((pid, index) => orderMap.set(pid, index));

    const allIds = Array.from(new Set([...teamAIds, ...teamBIds]));
    const playerDataEntries = await Promise.all(
      allIds.map(async (pid) => {
        const data = await this.redis.hgetall(keys.player(roomCode, pid));
        return [pid, data] as const;
      }),
    );

    const playerMap = new Map<string, Record<string, string>>();
    playerDataEntries.forEach(([pid, data]) => playerMap.set(pid, data));

    const toPlayer = (pid: string) => {
      const data = playerMap.get(pid) || {};
      const state: 'active' | 'reserved' = activeSet.has(pid)
        ? 'active'
        : reservedSet.has(pid)
          ? 'reserved'
          : data.state === 'reserved'
            ? 'reserved'
            : 'active';

      return {
        pid,
        displayName: data.displayName || pid,
        state,
      };
    };

    const sortByJoin = (left: string, right: string): number => {
      const leftOrder = orderMap.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = orderMap.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    };

    const sortedTeamA = [...teamAIds].sort(sortByJoin).map(toPlayer);
    const sortedTeamB = [...teamBIds].sort(sortByJoin).map(toPlayer);

    return {
      roomCode,
      status: roomData.status === 'LOCKED' ? 'LOCKED' : 'LOBBY',
      hostPid: roomData.hostPid || '',
      teamA: sortedTeamA,
      teamB: sortedTeamB,
      counts: {
        active: activeSet.size,
        reserved: reservedSet.size,
        occupied: activeSet.size + reservedSet.size,
        teamA: teamAIds.length,
        teamB: teamBIds.length,
      },
      rules: {
        maxPlayers: toNumber(roomData.maxPlayers, 12),
        maxTeamSize: toNumber(roomData.maxTeamSize, 6),
        equalTeamsRequired: roomData.equalTeamsRequired !== '0',
        minTeamStart: toNumber(roomData.minTeamStart, 1),
        graceSec: toNumber(roomData.graceSec, 60),
      },
    };
  }

  async listExpiredReservations(nowMs: number, limit: number): Promise<Array<{ roomCode: string; pid: string }>> {
    const members = await this.redis.zrangeByScore(keys.reservedGlobal, '-inf', String(nowMs), limit);
    const result: Array<{ roomCode: string; pid: string }> = [];

    for (const member of members) {
      const separator = member.indexOf(':');
      if (separator <= 0) {
        continue;
      }

      const roomCode = member.slice(0, separator);
      const pid = member.slice(separator + 1);
      if (!roomCode || !pid) {
        continue;
      }

      result.push({ roomCode, pid });
    }

    return result;
  }

  async listRooms(): Promise<string[]> {
    return this.redis.smembers(keys.roomsIndex);
  }

  async getRoomUpdatedAt(roomCode: string): Promise<number> {
    const roomData = await this.redis.hgetall(keys.room(roomCode));
    return toNumber(roomData.updatedAt, 0);
  }
}
