export type Team = 'A' | 'B';
export type RoomStatus = 'LOBBY' | 'LOCKED';
export type PlayerState = 'active' | 'reserved';
export type Role = 'HOST' | 'PLAYER';

export interface PlayerSnapshot {
  pid: string;
  displayName: string;
  state: PlayerState;
}

export interface RoomCounts {
  active: number;
  reserved: number;
  occupied: number;
  teamA: number;
  teamB: number;
}

export interface RoomRules {
  maxPlayers: number;
  maxTeamSize: number;
  equalTeamsRequired: boolean;
  minTeamStart: number;
  graceSec: number;
}

export interface RoomSnapshot {
  roomCode: string;
  status: RoomStatus;
  hostPid: string;
  teamA: PlayerSnapshot[];
  teamB: PlayerSnapshot[];
  counts: RoomCounts;
  rules: RoomRules;
}

export interface SessionClaims {
  sid: string;
  pid: string;
  roomCode: string;
  role: Role;
  exp: number;
}

export interface SessionRecord {
  sid: string;
  pid: string;
  roomCode: string;
  role: Role;
  exp: number;
  revoked: boolean;
}

export interface AuthContext {
  sid: string;
  pid: string;
  roomCode: string;
  role: Role;
}

export type ErrorCode =
  | 'INVALID_JSON'
  | 'INVALID_PAYLOAD'
  | 'UNKNOWN_EVENT'
  | 'UNAUTHORIZED'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_REVOKED'
  | 'SESSION_MISMATCH'
  | 'RATE_LIMITED'
  | 'ROOM_EXISTS'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'TEAM_FULL'
  | 'ROOM_LOCKED'
  | 'ALREADY_IN_ROOM'
  | 'NOT_IN_ROOM'
  | 'PLAYER_NOT_ACTIVE'
  | 'ONLY_HOST'
  | 'TEAMS_NOT_EQUAL'
  | 'MIN_PLAYERS_NOT_MET'
  | 'RESERVED_PENDING'
  | 'NOT_RESERVED'
  | 'RESERVATION_EXPIRED'
  | 'INTERNAL_ERROR';
