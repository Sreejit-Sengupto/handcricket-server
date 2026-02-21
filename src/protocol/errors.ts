import { ErrorCode } from '../types/domain';

interface ErrorDefinition {
  message: string;
  retryable: boolean;
}

const definitions: Record<ErrorCode, ErrorDefinition> = {
  INVALID_JSON: { message: 'Malformed JSON payload', retryable: true },
  INVALID_PAYLOAD: { message: 'Invalid payload fields', retryable: true },
  UNKNOWN_EVENT: { message: 'Unknown event type', retryable: true },
  UNAUTHORIZED: { message: 'Authentication required', retryable: false },
  TOKEN_INVALID: { message: 'Invalid token', retryable: false },
  TOKEN_EXPIRED: { message: 'Token expired', retryable: false },
  SESSION_NOT_FOUND: { message: 'Session not found', retryable: false },
  SESSION_REVOKED: { message: 'Session revoked', retryable: false },
  SESSION_MISMATCH: { message: 'Session mismatch', retryable: false },
  RATE_LIMITED: { message: 'Rate limit exceeded', retryable: true },
  ROOM_EXISTS: { message: 'Room code collision, retrying', retryable: true },
  ROOM_NOT_FOUND: { message: 'Room not found', retryable: true },
  ROOM_FULL: { message: 'Room is full', retryable: true },
  TEAM_FULL: { message: 'Team is full', retryable: true },
  ROOM_LOCKED: { message: 'Room is locked', retryable: true },
  ALREADY_IN_ROOM: { message: 'Already in room', retryable: false },
  NOT_IN_ROOM: { message: 'Player is not in room', retryable: false },
  PLAYER_NOT_ACTIVE: { message: 'Player must be active', retryable: true },
  ONLY_HOST: { message: 'Only host can do this action', retryable: false },
  TEAMS_NOT_EQUAL: { message: 'Teams must have equal players to start', retryable: true },
  MIN_PLAYERS_NOT_MET: { message: 'Both teams need at least one player', retryable: true },
  RESERVED_PENDING: { message: 'Cannot start while reserved players are pending reconnect', retryable: true },
  NOT_RESERVED: { message: 'No reserved slot available for this session', retryable: true },
  RESERVATION_EXPIRED: { message: 'Reserved slot expired', retryable: false },
  INTERNAL_ERROR: { message: 'Internal server error', retryable: true },
};

export const errorDetails = (code: ErrorCode): ErrorDefinition => {
  return definitions[code] || definitions.INTERNAL_ERROR;
};
