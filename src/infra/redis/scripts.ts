export const ROOM_CREATE_SCRIPT = `
local roomKey = KEYS[1]
local teamAKey = KEYS[2]
local teamBKey = KEYS[3]
local activeKey = KEYS[4]
local reservedKey = KEYS[5]
local joinOrderKey = KEYS[6]
local seqKey = KEYS[7]
local playersSetKey = KEYS[8]
local playerKey = KEYS[9]
local sessionKey = KEYS[10]
local roomsIndexKey = KEYS[11]

local roomCode = ARGV[1]
local pid = ARGV[2]
local displayName = ARGV[3]
local team = ARGV[4]
local sid = ARGV[5]
local nowMs = ARGV[6]
local sessionExp = ARGV[7]
local sessionTtlMs = tonumber(ARGV[8])
local maxPlayers = ARGV[9]
local maxTeamSize = ARGV[10]
local minTeamStart = ARGV[11]
local graceSec = ARGV[12]
local equalTeamsRequired = ARGV[13]

if redis.call('EXISTS', roomKey) == 1 then
  return {0, 'ROOM_EXISTS'}
end

redis.call('HSET', roomKey,
  'roomCode', roomCode,
  'status', 'LOBBY',
  'hostPid', pid,
  'createdAt', nowMs,
  'updatedAt', nowMs,
  'maxPlayers', maxPlayers,
  'maxTeamSize', maxTeamSize,
  'equalTeamsRequired', equalTeamsRequired,
  'minTeamStart', minTeamStart,
  'graceSec', graceSec
)

redis.call('SADD', roomsIndexKey, roomCode)
if team == 'A' then
  redis.call('SADD', teamAKey, pid)
else
  redis.call('SADD', teamBKey, pid)
end
redis.call('SADD', activeKey, pid)
redis.call('ZADD', joinOrderKey, 1, pid)
redis.call('SET', seqKey, 1)
redis.call('SADD', playersSetKey, pid)

redis.call('HSET', playerKey,
  'pid', pid,
  'displayName', displayName,
  'team', team,
  'role', 'HOST',
  'state', 'active',
  'joinSeq', 1,
  'sid', sid
)

redis.call('HSET', sessionKey,
  'sid', sid,
  'pid', pid,
  'roomCode', roomCode,
  'role', 'HOST',
  'exp', sessionExp,
  'revoked', 0
)
if sessionTtlMs > 0 then
  redis.call('PEXPIRE', sessionKey, sessionTtlMs)
end

return {1, 'OK'}
`;

export const ROOM_JOIN_SCRIPT = `
local roomKey = KEYS[1]
local teamAKey = KEYS[2]
local teamBKey = KEYS[3]
local activeKey = KEYS[4]
local reservedKey = KEYS[5]
local joinOrderKey = KEYS[6]
local seqKey = KEYS[7]
local playersSetKey = KEYS[8]
local playerKey = KEYS[9]
local sessionKey = KEYS[10]

local roomCode = ARGV[1]
local pid = ARGV[2]
local displayName = ARGV[3]
local team = ARGV[4]
local sid = ARGV[5]
local nowMs = ARGV[6]
local sessionExp = ARGV[7]
local sessionTtlMs = tonumber(ARGV[8])
local maxPlayers = tonumber(ARGV[9])
local maxTeamSize = tonumber(ARGV[10])

if redis.call('EXISTS', roomKey) == 0 then
  return {0, 'ROOM_NOT_FOUND'}
end

if redis.call('HGET', roomKey, 'status') ~= 'LOBBY' then
  return {0, 'ROOM_LOCKED'}
end

if redis.call('EXISTS', playerKey) == 1 then
  return {0, 'ALREADY_IN_ROOM'}
end

local targetKey = teamAKey
if team == 'B' then
  targetKey = teamBKey
end

if redis.call('SCARD', targetKey) >= maxTeamSize then
  return {0, 'TEAM_FULL'}
end

local occupied = redis.call('SCARD', activeKey) + redis.call('ZCARD', reservedKey)
if occupied >= maxPlayers then
  return {0, 'ROOM_FULL'}
end

local joinSeq = redis.call('INCR', seqKey)
redis.call('SADD', targetKey, pid)
redis.call('SADD', activeKey, pid)
redis.call('ZREM', reservedKey, pid)
redis.call('ZADD', joinOrderKey, joinSeq, pid)
redis.call('SADD', playersSetKey, pid)

redis.call('HSET', playerKey,
  'pid', pid,
  'displayName', displayName,
  'team', team,
  'role', 'PLAYER',
  'state', 'active',
  'joinSeq', joinSeq,
  'sid', sid
)

redis.call('HSET', roomKey, 'updatedAt', nowMs)

redis.call('HSET', sessionKey,
  'sid', sid,
  'pid', pid,
  'roomCode', roomCode,
  'role', 'PLAYER',
  'exp', sessionExp,
  'revoked', 0
)
if sessionTtlMs > 0 then
  redis.call('PEXPIRE', sessionKey, sessionTtlMs)
end

return {1, 'OK'}
`;

export const TEAM_SWITCH_SCRIPT = `
local roomKey = KEYS[1]
local teamAKey = KEYS[2]
local teamBKey = KEYS[3]
local activeKey = KEYS[4]
local playerKey = KEYS[5]

local pid = ARGV[1]
local targetTeam = ARGV[2]
local nowMs = ARGV[3]
local maxTeamSize = tonumber(ARGV[4])

if redis.call('EXISTS', roomKey) == 0 then
  return {0, 'ROOM_NOT_FOUND'}
end

if redis.call('HGET', roomKey, 'status') ~= 'LOBBY' then
  return {0, 'ROOM_LOCKED'}
end

if redis.call('EXISTS', playerKey) == 0 then
  return {0, 'NOT_IN_ROOM'}
end

if redis.call('SISMEMBER', activeKey, pid) == 0 then
  return {0, 'PLAYER_NOT_ACTIVE'}
end

local sourceTeam = redis.call('HGET', playerKey, 'team')
if sourceTeam == targetTeam then
  return {1, 'NOOP'}
end

local targetTeamKey = teamAKey
if targetTeam == 'B' then
  targetTeamKey = teamBKey
end

if redis.call('SCARD', targetTeamKey) >= maxTeamSize then
  return {0, 'TEAM_FULL'}
end

if sourceTeam == 'A' then
  redis.call('SREM', teamAKey, pid)
else
  redis.call('SREM', teamBKey, pid)
end

if targetTeam == 'A' then
  redis.call('SADD', teamAKey, pid)
else
  redis.call('SADD', teamBKey, pid)
end

redis.call('HSET', playerKey, 'team', targetTeam)
redis.call('HSET', roomKey, 'updatedAt', nowMs)

return {1, 'OK'}
`;

export const ROOM_START_SCRIPT = `
local roomKey = KEYS[1]
local teamAKey = KEYS[2]
local teamBKey = KEYS[3]
local reservedKey = KEYS[4]

local pid = ARGV[1]
local nowMs = ARGV[2]
local minTeamStart = tonumber(ARGV[3])
local equalTeamsRequired = tonumber(ARGV[4])

if redis.call('EXISTS', roomKey) == 0 then
  return {0, 'ROOM_NOT_FOUND'}
end

if redis.call('HGET', roomKey, 'status') ~= 'LOBBY' then
  return {0, 'ROOM_LOCKED'}
end

local hostPid = redis.call('HGET', roomKey, 'hostPid')
if hostPid ~= pid then
  return {0, 'ONLY_HOST'}
end

if redis.call('ZCARD', reservedKey) > 0 then
  return {0, 'RESERVED_PENDING'}
end

local teamASize = redis.call('SCARD', teamAKey)
local teamBSize = redis.call('SCARD', teamBKey)

if teamASize < minTeamStart or teamBSize < minTeamStart then
  return {0, 'MIN_PLAYERS_NOT_MET'}
end

if equalTeamsRequired == 1 and teamASize ~= teamBSize then
  return {0, 'TEAMS_NOT_EQUAL'}
end

redis.call('HSET', roomKey, 'status', 'LOCKED', 'updatedAt', nowMs)

return {1, 'OK'}
`;

export const DISCONNECT_HOLD_SCRIPT = `
local roomKey = KEYS[1]
local activeKey = KEYS[2]
local reservedKey = KEYS[3]
local playerKey = KEYS[4]
local reservedGlobalKey = KEYS[5]

local roomCode = ARGV[1]
local pid = ARGV[2]
local nowMs = ARGV[3]
local expiryMs = ARGV[4]

if redis.call('EXISTS', roomKey) == 0 then
  return {0, 'ROOM_NOT_FOUND'}
end

if redis.call('EXISTS', playerKey) == 0 then
  return {0, 'NOT_IN_ROOM'}
end

if redis.call('SISMEMBER', activeKey, pid) == 0 then
  return {1, 'NOOP'}
end

redis.call('SREM', activeKey, pid)
redis.call('ZADD', reservedKey, expiryMs, pid)
redis.call('ZADD', reservedGlobalKey, expiryMs, roomCode .. ':' .. pid)
redis.call('HSET', playerKey, 'state', 'reserved')
redis.call('HSET', roomKey, 'updatedAt', nowMs)

return {1, 'OK'}
`;

export const RESUME_RECONNECT_SCRIPT = `
local roomKey = KEYS[1]
local activeKey = KEYS[2]
local reservedKey = KEYS[3]
local playerKey = KEYS[4]
local reservedGlobalKey = KEYS[5]

local roomCode = ARGV[1]
local pid = ARGV[2]
local sid = ARGV[3]
local nowMs = tonumber(ARGV[4])

if redis.call('EXISTS', roomKey) == 0 then
  return {0, 'ROOM_NOT_FOUND'}
end

if redis.call('EXISTS', playerKey) == 0 then
  return {0, 'NOT_IN_ROOM'}
end

if redis.call('SISMEMBER', activeKey, pid) == 1 then
  redis.call('HSET', playerKey, 'state', 'active', 'sid', sid)
  redis.call('HSET', roomKey, 'updatedAt', nowMs)
  return {1, 'ALREADY_ACTIVE'}
end

local expiry = redis.call('ZSCORE', reservedKey, pid)
if not expiry then
  return {0, 'NOT_RESERVED'}
end

if tonumber(expiry) < nowMs then
  return {0, 'RESERVATION_EXPIRED'}
end

redis.call('ZREM', reservedKey, pid)
redis.call('SADD', activeKey, pid)
redis.call('ZREM', reservedGlobalKey, roomCode .. ':' .. pid)
redis.call('HSET', playerKey, 'state', 'active', 'sid', sid)
redis.call('HSET', roomKey, 'updatedAt', nowMs)

return {1, 'OK'}
`;

export const EXPIRE_RESERVED_SCRIPT = `
local roomKey = KEYS[1]
local teamAKey = KEYS[2]
local teamBKey = KEYS[3]
local activeKey = KEYS[4]
local reservedKey = KEYS[5]
local joinOrderKey = KEYS[6]
local seqKey = KEYS[7]
local playersSetKey = KEYS[8]
local roomsIndexKey = KEYS[9]
local reservedGlobalKey = KEYS[10]
local playerKey = KEYS[11]

local roomCode = ARGV[1]
local pid = ARGV[2]
local nowMs = tonumber(ARGV[3])
local playerPrefix = ARGV[4]

if redis.call('EXISTS', roomKey) == 0 then
  redis.call('ZREM', reservedGlobalKey, roomCode .. ':' .. pid)
  return {1, 'ROOM_GONE'}
end

local expiry = redis.call('ZSCORE', reservedKey, pid)
if not expiry then
  redis.call('ZREM', reservedGlobalKey, roomCode .. ':' .. pid)
  return {1, 'NOT_RESERVED'}
end

if tonumber(expiry) > nowMs then
  return {0, 'NOT_EXPIRED'}
end

redis.call('ZREM', reservedKey, pid)
redis.call('ZREM', reservedGlobalKey, roomCode .. ':' .. pid)
redis.call('SREM', activeKey, pid)

local role = redis.call('HGET', playerKey, 'role')
local team = redis.call('HGET', playerKey, 'team')

if team == 'A' then
  redis.call('SREM', teamAKey, pid)
elseif team == 'B' then
  redis.call('SREM', teamBKey, pid)
end

redis.call('ZREM', joinOrderKey, pid)
redis.call('SREM', playersSetKey, pid)
redis.call('DEL', playerKey)

local occupied = redis.call('SCARD', activeKey) + redis.call('ZCARD', reservedKey)
if occupied == 0 then
  redis.call('DEL', roomKey, teamAKey, teamBKey, activeKey, reservedKey, joinOrderKey, seqKey, playersSetKey)
  redis.call('SREM', roomsIndexKey, roomCode)
  return {1, 'ROOM_DELETED'}
end

if role == 'HOST' then
  local members = redis.call('ZRANGE', joinOrderKey, 0, -1)
  local newHost = nil

  for i = 1, #members do
    local candidate = members[i]
    if redis.call('SISMEMBER', activeKey, candidate) == 1 then
      newHost = candidate
      break
    end
  end

  if not newHost then
    for i = 1, #members do
      local candidate = members[i]
      if redis.call('ZSCORE', reservedKey, candidate) then
        newHost = candidate
        break
      end
    end
  end

  if newHost then
    redis.call('HSET', roomKey, 'hostPid', newHost)
    local hostPlayerKey = playerPrefix .. newHost
    if redis.call('EXISTS', hostPlayerKey) == 1 then
      redis.call('HSET', hostPlayerKey, 'role', 'HOST')
    end
  end
end

redis.call('HSET', roomKey, 'updatedAt', tostring(nowMs))
return {1, 'OK'}
`;

export const CLEANUP_IDLE_ROOM_SCRIPT = `
local roomKey = KEYS[1]
local teamAKey = KEYS[2]
local teamBKey = KEYS[3]
local activeKey = KEYS[4]
local reservedKey = KEYS[5]
local joinOrderKey = KEYS[6]
local seqKey = KEYS[7]
local playersSetKey = KEYS[8]
local roomsIndexKey = KEYS[9]
local reservedGlobalKey = KEYS[10]

local roomCode = ARGV[1]
local playerPrefix = ARGV[2]

if redis.call('EXISTS', roomKey) == 0 then
  redis.call('SREM', roomsIndexKey, roomCode)
  return {1, 'ROOM_GONE'}
end

local players = redis.call('SMEMBERS', playersSetKey)
for i = 1, #players do
  local pid = players[i]
  redis.call('DEL', playerPrefix .. pid)
  redis.call('ZREM', reservedGlobalKey, roomCode .. ':' .. pid)
end

redis.call('DEL', roomKey, teamAKey, teamBKey, activeKey, reservedKey, joinOrderKey, seqKey, playersSetKey)
redis.call('SREM', roomsIndexKey, roomCode)

return {1, 'ROOM_DELETED'}
`;

export const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local windowMs = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])

local current = redis.call('INCR', key)
if current == 1 then
  redis.call('PEXPIRE', key, windowMs)
end

if current > limit then
  return {0, tostring(current)}
end

return {1, tostring(current)}
`;
