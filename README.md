# Hand Cricket Lobby Server (Phase 1)

This server now implements a Redis-backed, secure multiplayer lobby for hand-cricket.

## What is implemented

- Private room creation using 6-char base32 room codes.
- Room capacity enforcement: maximum 12 occupied slots.
- Two teams (`A`, `B`) with max 6 players each.
- Player-choice join + free self team switching in lobby.
- Host-only room start with strict equal-team rule (`1v1` to `6v6`).
- Reconnect grace handling (60s reserved slot hold).
- Redis atomic Lua scripts for race-safe `create/join/switch/start/disconnect/resume/expire` flows.
- Signed session tokens (HMAC), runtime payload validation, rate limits, and structured audit logging.
- Pub/Sub room fanout for multi-instance broadcast consistency.

## Tech stack

- Node.js + TypeScript
- Express + ws
- Redis + ioredis

## Environment variables

```env
PORT=8000
# Preferred for managed Redis (Upstash, etc.). Supports rediss:// and ediss://.
REDIS_URL=

# Fallback if REDIS_URL is empty
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

TOKEN_SECRET=dev-only-change-this-secret
SESSION_TTL_SEC=86400
ROOM_IDLE_MS=1800000
RECONNECT_GRACE_SEC=60
REAPER_INTERVAL_MS=5000
MAX_WS_PAYLOAD_BYTES=2048
WS_ALLOWED_ORIGINS=*
RATE_CONNECT_PER_MIN=20
RATE_CREATE_PER_MIN=3
RATE_JOIN_PER_MIN=15
RATE_SWITCH_PER_MIN=30
RATE_START_PER_MIN=15
RATE_AUTH_PER_MIN=30
RATE_INVALID_CODE_PER_MIN=20
```

## Run locally

1. Ensure Redis is reachable (local or `REDIS_URL`).
2. Install dependencies:
```bash
npm install
```
3. Compile and run:
```bash
npm run dev
```

## WebSocket protocol

### Client -> Server

1. `ROOM_CREATE`
```json
{ "type": "ROOM_CREATE", "payload": { "displayName": "Alice", "preferredTeam": "A" } }
```

2. `ROOM_JOIN`
```json
{ "type": "ROOM_JOIN", "payload": { "roomCode": "ABC234", "displayName": "Bob", "preferredTeam": "B" } }
```

3. `AUTH_RESUME`
```json
{ "type": "AUTH_RESUME", "payload": { "token": "<session-token>" } }
```

4. `TEAM_SWITCH`
```json
{ "type": "TEAM_SWITCH", "payload": { "targetTeam": "A" } }
```

5. `ROOM_START`
```json
{ "type": "ROOM_START", "payload": {} }
```

### Server -> Client

- `ROOM_CREATED`
- `ROOM_JOINED`
- `AUTH_OK`
- `ROOM_STATE`
- `ROOM_LOCKED`
- `ROOM_ERROR`
- `AUTH_ERROR`

`ROOM_STATE` is authoritative and should be used by the frontend as the source of truth.

## Start rule

`ROOM_START` succeeds only when:

- caller is host,
- room is in `LOBBY`,
- no reserved players pending reconnect,
- `teamA == teamB`,
- `teamA >= 1`.

So valid starts are: `1v1`, `2v2`, ..., `6v6`.
