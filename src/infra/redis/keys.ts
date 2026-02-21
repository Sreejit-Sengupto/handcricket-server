const PREFIX = 'hc';

export const keys = {
  roomsIndex: `${PREFIX}:rooms`,
  reservedGlobal: `${PREFIX}:reserved:global`,
  rateLimit: (scope: string, id: string): string => `${PREFIX}:rl:${scope}:${id}`,
  room: (roomCode: string): string => `${PREFIX}:room:${roomCode}`,
  roomTeamA: (roomCode: string): string => `${PREFIX}:room:${roomCode}:team:A`,
  roomTeamB: (roomCode: string): string => `${PREFIX}:room:${roomCode}:team:B`,
  roomActive: (roomCode: string): string => `${PREFIX}:room:${roomCode}:active`,
  roomReserved: (roomCode: string): string => `${PREFIX}:room:${roomCode}:reserved`,
  roomJoinOrder: (roomCode: string): string => `${PREFIX}:room:${roomCode}:joinorder`,
  roomSeq: (roomCode: string): string => `${PREFIX}:room:${roomCode}:seq`,
  roomPlayersSet: (roomCode: string): string => `${PREFIX}:room:${roomCode}:players`,
  playerPrefix: (roomCode: string): string => `${PREFIX}:room:${roomCode}:player:`,
  player: (roomCode: string, pid: string): string => `${PREFIX}:room:${roomCode}:player:${pid}`,
  session: (sid: string): string => `${PREFIX}:session:${sid}`,
  roomEventsChannel: (roomCode: string): string => `${PREFIX}:room:${roomCode}:events`,
  roomEventsPattern: `${PREFIX}:room:*:events`,
};

export const parseRoomCodeFromChannel = (channel: string): string | null => {
  const match = channel.match(/^hc:room:([A-Z2-7]{6}):events$/);
  if (!match) {
    return null;
  }
  return match[1] || null;
};
