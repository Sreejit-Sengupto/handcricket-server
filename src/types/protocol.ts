import { RoomSnapshot, Team } from './domain';

export interface RoomCreatePayload {
  displayName: string;
  preferredTeam?: Team | null;
}

export interface RoomJoinPayload {
  roomCode: string;
  displayName: string;
  preferredTeam: Team;
}

export interface AuthResumePayload {
  token: string;
}

export interface TeamSwitchPayload {
  targetTeam: Team;
}

export type ClientEvent =
  | { type: 'ROOM_CREATE'; payload: RoomCreatePayload }
  | { type: 'ROOM_JOIN'; payload: RoomJoinPayload }
  | { type: 'AUTH_RESUME'; payload: AuthResumePayload }
  | { type: 'TEAM_SWITCH'; payload: TeamSwitchPayload }
  | { type: 'ROOM_START'; payload?: Record<string, never> };

export interface RoomCreatedMessage {
  type: 'ROOM_CREATED';
  payload: {
    roomCode: string;
    token: string;
    me: {
      pid: string;
      role: 'HOST' | 'PLAYER';
    };
    roomSnapshot: RoomSnapshot;
  };
}

export interface RoomJoinedMessage {
  type: 'ROOM_JOINED';
  payload: {
    roomCode: string;
    token: string;
    me: {
      pid: string;
      role: 'HOST' | 'PLAYER';
    };
    roomSnapshot: RoomSnapshot;
  };
}

export interface AuthOkMessage {
  type: 'AUTH_OK';
  payload: {
    roomCode: string;
    me: {
      pid: string;
      role: 'HOST' | 'PLAYER';
    };
    roomSnapshot: RoomSnapshot;
  };
}

export interface RoomStateMessage {
  type: 'ROOM_STATE';
  payload: RoomSnapshot;
}

export interface RoomLockedMessage {
  type: 'ROOM_LOCKED';
  payload: {
    roomCode: string;
    lockedAt: number;
  };
}

export interface RoomErrorMessage {
  type: 'ROOM_ERROR';
  payload: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface AuthErrorMessage {
  type: 'AUTH_ERROR';
  payload: {
    code: string;
    message: string;
  };
}

export type ServerEvent =
  | RoomCreatedMessage
  | RoomJoinedMessage
  | AuthOkMessage
  | RoomStateMessage
  | RoomLockedMessage
  | RoomErrorMessage
  | AuthErrorMessage;
