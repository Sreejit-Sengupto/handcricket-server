import {
  AuthResumePayload,
  ClientEvent,
  RoomCreatePayload,
  RoomJoinPayload,
  TeamSwitchPayload,
} from '../types/protocol';
import { Team } from '../types/domain';

export interface ValidationError {
  code: 'INVALID_JSON' | 'INVALID_PAYLOAD' | 'UNKNOWN_EVENT';
  message: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isNonEmptyString = (value: unknown, maxLen = 64): value is string => {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLen;
};

const isTeam = (value: unknown): value is Team => {
  return value === 'A' || value === 'B';
};

export const isRoomCode = (value: string): boolean => {
  return /^[A-Z2-7]{6}$/.test(value);
};

const parseRoomCreate = (payload: unknown): RoomCreatePayload | null => {
  if (!isRecord(payload)) {
    return null;
  }

  if (!isNonEmptyString(payload.displayName, 24)) {
    return null;
  }

  const preferredTeamRaw = payload.preferredTeam;
  if (preferredTeamRaw === undefined || preferredTeamRaw === null) {
    return { displayName: payload.displayName.trim(), preferredTeam: null };
  }

  if (!isTeam(preferredTeamRaw)) {
    return null;
  }

  return {
    displayName: payload.displayName.trim(),
    preferredTeam: preferredTeamRaw,
  };
};

const parseRoomJoin = (payload: unknown): RoomJoinPayload | null => {
  if (!isRecord(payload)) {
    return null;
  }

  if (!isNonEmptyString(payload.roomCode, 6) || !isRoomCode(payload.roomCode.trim())) {
    return null;
  }

  if (!isNonEmptyString(payload.displayName, 24)) {
    return null;
  }

  if (!isTeam(payload.preferredTeam)) {
    return null;
  }

  return {
    roomCode: payload.roomCode.trim().toUpperCase(),
    displayName: payload.displayName.trim(),
    preferredTeam: payload.preferredTeam,
  };
};

const parseAuthResume = (payload: unknown): AuthResumePayload | null => {
  if (!isRecord(payload)) {
    return null;
  }
  if (!isNonEmptyString(payload.token, 2_048)) {
    return null;
  }
  return {
    token: payload.token,
  };
};

const parseTeamSwitch = (payload: unknown): TeamSwitchPayload | null => {
  if (!isRecord(payload)) {
    return null;
  }
  if (!isTeam(payload.targetTeam)) {
    return null;
  }
  return {
    targetTeam: payload.targetTeam,
  };
};

export const parseClientEvent = (rawMessage: string):
  | { ok: true; event: ClientEvent }
  | { ok: false; error: ValidationError } => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    return {
      ok: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Payload is not valid JSON',
      },
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PAYLOAD',
        message: 'Message must be an object',
      },
    };
  }

  if (!isNonEmptyString(parsed.type, 40)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PAYLOAD',
        message: 'Message type is required',
      },
    };
  }

  switch (parsed.type) {
    case 'ROOM_CREATE': {
      const payload = parseRoomCreate(parsed.payload);
      if (!payload) {
        return {
          ok: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Invalid ROOM_CREATE payload',
          },
        };
      }
      return {
        ok: true,
        event: {
          type: 'ROOM_CREATE',
          payload,
        },
      };
    }

    case 'ROOM_JOIN': {
      const payload = parseRoomJoin(parsed.payload);
      if (!payload) {
        return {
          ok: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Invalid ROOM_JOIN payload',
          },
        };
      }
      return {
        ok: true,
        event: {
          type: 'ROOM_JOIN',
          payload,
        },
      };
    }

    case 'AUTH_RESUME': {
      const payload = parseAuthResume(parsed.payload);
      if (!payload) {
        return {
          ok: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Invalid AUTH_RESUME payload',
          },
        };
      }
      return {
        ok: true,
        event: {
          type: 'AUTH_RESUME',
          payload,
        },
      };
    }

    case 'TEAM_SWITCH': {
      const payload = parseTeamSwitch(parsed.payload);
      if (!payload) {
        return {
          ok: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Invalid TEAM_SWITCH payload',
          },
        };
      }
      return {
        ok: true,
        event: {
          type: 'TEAM_SWITCH',
          payload,
        },
      };
    }

    case 'ROOM_START': {
      if (parsed.payload !== undefined && !isRecord(parsed.payload)) {
        return {
          ok: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Invalid ROOM_START payload',
          },
        };
      }
      return {
        ok: true,
        event: {
          type: 'ROOM_START',
          payload: {},
        },
      };
    }

    default:
      return {
        ok: false,
        error: {
          code: 'UNKNOWN_EVENT',
          message: `Unknown event type: ${parsed.type}`,
        },
      };
  }
};
