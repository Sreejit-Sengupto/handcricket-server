import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import config, { hashIp, isOriginAllowed } from './config/env';
import { parseClientEvent } from './protocol/validation';
import { errorDetails } from './protocol/errors';
import { RedisConnection, RedisCommands, RedisSubscriber } from './infra/redis/resp';
import { RedisLobbyRepository } from './infra/redis/repository';
import { LobbyService } from './services/lobbyService';
import { RateLimiter } from './security/rateLimit';
import { RoomBroadcaster } from './services/roomBroadcaster';
import { startReaper } from './jobs/reaper';
import { ErrorCode, SessionClaims } from './types/domain';
import { AuthErrorMessage, RoomErrorMessage, ServerEvent } from './types/protocol';
import { logAudit, logSystem } from './utils/logger';

interface SocketContext {
  ip: string;
  ipHash: string;
  requestId: string;
  auth?: SessionClaims;
}

const toRawMessage = (data: RawData): string => {
  if (typeof data === 'string') {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }

  return Buffer.from(data).toString('utf8');
};

const parseIp = (wsRequest: import('http').IncomingMessage): string => {
  const xForwardedFor = wsRequest.headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string') {
    const first = xForwardedFor.split(',')[0];
    if (first && first.trim().length > 0) {
      return first.trim();
    }
  }

  return wsRequest.socket.remoteAddress || 'unknown';
};

const send = (socket: WebSocket, event: ServerEvent): void => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(event));
  }
};

const sendRoomError = (socket: WebSocket, code: ErrorCode): void => {
  const details = errorDetails(code);
  const message: RoomErrorMessage = {
    type: 'ROOM_ERROR',
    payload: {
      code,
      message: details.message,
      retryable: details.retryable,
    },
  };

  send(socket, message);
};

const sendAuthError = (socket: WebSocket, code: ErrorCode): void => {
  const details = errorDetails(code);
  const message: AuthErrorMessage = {
    type: 'AUTH_ERROR',
    payload: {
      code,
      message: details.message,
    },
  };

  send(socket, message);
};

const authErrorCodes = new Set<ErrorCode>([
  'UNAUTHORIZED',
  'TOKEN_INVALID',
  'TOKEN_EXPIRED',
  'SESSION_NOT_FOUND',
  'SESSION_REVOKED',
  'SESSION_MISMATCH',
  'RATE_LIMITED',
  'NOT_RESERVED',
  'RESERVATION_EXPIRED',
  'ROOM_NOT_FOUND',
]);

const bootstrap = async (): Promise<void> => {
  const app = express();
  app.use(cors({ origin: '*' }));

  const redisConnectionOptions = config.redisUrl
    ? { url: config.redisUrl }
    : {
      host: config.redisHost,
      port: config.redisPort,
      password: config.redisPassword,
    };

  const commandConnection = new RedisConnection(redisConnectionOptions);
  await commandConnection.connect();

  const redisCommands = new RedisCommands(commandConnection);
  await redisCommands.ping();

  const subscriber = new RedisSubscriber(redisConnectionOptions);
  await subscriber.connect();

  const repository = new RedisLobbyRepository(redisCommands);
  const lobbyService = new LobbyService(repository);
  const rateLimiter = new RateLimiter(repository);
  const broadcaster = new RoomBroadcaster(`instance_${randomUUID()}`, redisCommands);
  await broadcaster.attachSubscriber(subscriber);

  startReaper(lobbyService, config.reaperIntervalMs);

  const server = app.listen(config.port, () => {
    logSystem('Server started', {
      port: config.port,
      redisMode: config.redisUrl ? 'url' : 'host-port',
      redisHost: config.redisUrl ? 'configured-via-url' : config.redisHost,
      redisPort: config.redisUrl ? 0 : config.redisPort,
    });
  });

  const socketContext = new Map<WebSocket, SocketContext>();
  const sessionSockets = new Map<string, WebSocket>();

  const wss = new WebSocketServer({
    server,
    maxPayload: config.maxWsPayloadBytes,
  });

  const registerAuth = (socket: WebSocket, claims: SessionClaims): void => {
    const context = socketContext.get(socket);
    if (!context) {
      return;
    }

    const previousSocket = sessionSockets.get(claims.sid);
    sessionSockets.set(claims.sid, socket);
    context.auth = claims;
    socketContext.set(socket, context);
    broadcaster.addSocket(claims.roomCode, socket);

    if (previousSocket && previousSocket !== socket && previousSocket.readyState === WebSocket.OPEN) {
      previousSocket.close(4001, 'SESSION_REPLACED');
    }
  };

  const publishRoomState = async (roomCode: string): Promise<void> => {
    const snapshot = await lobbyService.getSnapshot(roomCode);
    if (!snapshot) {
      return;
    }

    await broadcaster.broadcast(roomCode, {
      type: 'ROOM_STATE',
      payload: snapshot,
    });
  };

  const handleMessage = async (socket: WebSocket, rawData: RawData): Promise<void> => {
    const context = socketContext.get(socket);
    if (!context) {
      return;
    }

    const requestId = randomUUID();
    const raw = toRawMessage(rawData);
    const parsed = parseClientEvent(raw);

    if (!parsed.ok) {
      sendRoomError(socket, parsed.error.code);
      logAudit({
        level: 'warn',
        event: 'MESSAGE',
        result: 'failure',
        reasonCode: parsed.error.code,
        ipHash: context.ipHash,
        requestId,
      });
      return;
    }

    const event = parsed.event;

    if (event.type === 'ROOM_CREATE') {
      if (context.auth) {
        sendRoomError(socket, 'UNAUTHORIZED');
        return;
      }

      const allowed = await rateLimiter.allow(
        'create',
        context.ipHash,
        config.rateLimits.createPerMin,
        60_000,
      );

      if (!allowed) {
        sendRoomError(socket, 'RATE_LIMITED');
        logAudit({
          level: 'warn',
          event: 'ROOM_CREATE',
          result: 'failure',
          reasonCode: 'RATE_LIMITED',
          ipHash: context.ipHash,
          requestId,
        });
        return;
      }

      const result = await lobbyService.createRoom(
        event.payload.displayName,
        event.payload.preferredTeam || null,
      );

      if (!result.ok) {
        sendRoomError(socket, result.code);
        logAudit({
          level: 'warn',
          event: 'ROOM_CREATE',
          result: 'failure',
          reasonCode: result.code,
          ipHash: context.ipHash,
          requestId,
        });
        return;
      }

      const { token, claims } = result.data;
      registerAuth(socket, claims);

      const snapshot = await lobbyService.getSnapshot(claims.roomCode);
      if (!snapshot) {
        sendRoomError(socket, 'INTERNAL_ERROR');
        return;
      }

      send(socket, {
        type: 'ROOM_CREATED',
        payload: {
          roomCode: claims.roomCode,
          token,
          me: {
            pid: claims.pid,
            role: claims.role,
          },
          roomSnapshot: snapshot,
        },
      });

      logAudit({
        level: 'info',
        event: 'ROOM_CREATE',
        result: 'success',
        reasonCode: 'OK',
        roomCode: claims.roomCode,
        pid: claims.pid,
        sid: claims.sid,
        ipHash: context.ipHash,
        requestId,
      });
      return;
    }

    if (event.type === 'ROOM_JOIN') {
      if (context.auth) {
        sendRoomError(socket, 'UNAUTHORIZED');
        return;
      }

      const joinAllowed = await rateLimiter.allow(
        'join',
        context.ipHash,
        config.rateLimits.joinPerMin,
        60_000,
      );

      if (!joinAllowed) {
        sendRoomError(socket, 'RATE_LIMITED');
        logAudit({
          level: 'warn',
          event: 'ROOM_JOIN',
          result: 'failure',
          reasonCode: 'RATE_LIMITED',
          roomCode: event.payload.roomCode,
          ipHash: context.ipHash,
          requestId,
        });
        return;
      }

      const result = await lobbyService.joinRoom(
        event.payload.roomCode,
        event.payload.displayName,
        event.payload.preferredTeam,
      );

      if (!result.ok) {
        if (result.code === 'ROOM_NOT_FOUND') {
          await rateLimiter.allow(
            'invalid_room_code',
            context.ipHash,
            config.rateLimits.invalidCodePerMin,
            60_000,
          );
        }
        sendRoomError(socket, result.code);
        logAudit({
          level: 'warn',
          event: 'ROOM_JOIN',
          result: 'failure',
          reasonCode: result.code,
          roomCode: event.payload.roomCode,
          ipHash: context.ipHash,
          requestId,
        });
        return;
      }

      const { token, claims } = result.data;
      registerAuth(socket, claims);

      const snapshot = await lobbyService.getSnapshot(claims.roomCode);
      if (!snapshot) {
        sendRoomError(socket, 'INTERNAL_ERROR');
        return;
      }

      send(socket, {
        type: 'ROOM_JOINED',
        payload: {
          roomCode: claims.roomCode,
          token,
          me: {
            pid: claims.pid,
            role: claims.role,
          },
          roomSnapshot: snapshot,
        },
      });

      await publishRoomState(claims.roomCode);

      logAudit({
        level: 'info',
        event: 'ROOM_JOIN',
        result: 'success',
        reasonCode: 'OK',
        roomCode: claims.roomCode,
        pid: claims.pid,
        sid: claims.sid,
        ipHash: context.ipHash,
        requestId,
      });
      return;
    }

    if (event.type === 'AUTH_RESUME') {
      const allowed = await rateLimiter.allow(
        'auth',
        context.ipHash,
        config.rateLimits.authPerMin,
        60_000,
      );

      if (!allowed) {
        sendAuthError(socket, 'RATE_LIMITED');
        logAudit({
          level: 'warn',
          event: 'AUTH_RESUME',
          result: 'failure',
          reasonCode: 'RATE_LIMITED',
          ipHash: context.ipHash,
          requestId,
        });
        return;
      }

      const result = await lobbyService.resumeSession(event.payload.token);
      if (!result.ok) {
        const asAuthError: ErrorCode = authErrorCodes.has(result.code) ? result.code : 'UNAUTHORIZED';
        sendAuthError(socket, asAuthError);
        logAudit({
          level: 'warn',
          event: 'AUTH_RESUME',
          result: 'failure',
          reasonCode: result.code,
          ipHash: context.ipHash,
          requestId,
        });
        return;
      }

      const claims = result.data.claims;
      registerAuth(socket, claims);

      const snapshot = await lobbyService.getSnapshot(claims.roomCode);
      if (!snapshot) {
        sendRoomError(socket, 'ROOM_NOT_FOUND');
        return;
      }

      send(socket, {
        type: 'AUTH_OK',
        payload: {
          roomCode: claims.roomCode,
          me: {
            pid: claims.pid,
            role: claims.role,
          },
          roomSnapshot: snapshot,
        },
      });

      await publishRoomState(claims.roomCode);

      logAudit({
        level: 'info',
        event: 'AUTH_RESUME',
        result: 'success',
        reasonCode: 'OK',
        roomCode: claims.roomCode,
        pid: claims.pid,
        sid: claims.sid,
        ipHash: context.ipHash,
        requestId,
      });
      return;
    }

    const auth = context.auth;
    if (!auth) {
      sendRoomError(socket, 'UNAUTHORIZED');
      logAudit({
        level: 'warn',
        event: event.type,
        result: 'failure',
        reasonCode: 'UNAUTHORIZED',
        ipHash: context.ipHash,
        requestId,
      });
      return;
    }

    if (event.type === 'TEAM_SWITCH') {
      const allowed = await rateLimiter.allow(
        `switch:${auth.sid}`,
        auth.sid,
        config.rateLimits.switchPerMin,
        60_000,
      );

      if (!allowed) {
        sendRoomError(socket, 'RATE_LIMITED');
        return;
      }

      const result = await lobbyService.switchTeam(auth, event.payload.targetTeam);
      if (!result.ok) {
        sendRoomError(socket, result.code);
        logAudit({
          level: 'warn',
          event: 'TEAM_SWITCH',
          result: 'failure',
          reasonCode: result.code,
          roomCode: auth.roomCode,
          pid: auth.pid,
          sid: auth.sid,
          ipHash: context.ipHash,
          requestId,
        });
        return;
      }

      await publishRoomState(auth.roomCode);

      logAudit({
        level: 'info',
        event: 'TEAM_SWITCH',
        result: 'success',
        reasonCode: 'OK',
        roomCode: auth.roomCode,
        pid: auth.pid,
        sid: auth.sid,
        ipHash: context.ipHash,
        requestId,
      });
      return;
    }

    if (event.type === 'ROOM_START') {
      const allowed = await rateLimiter.allow(
        `start:${auth.sid}`,
        auth.sid,
        config.rateLimits.startPerMin,
        60_000,
      );

      if (!allowed) {
        sendRoomError(socket, 'RATE_LIMITED');
        return;
      }

      const result = await lobbyService.startRoom(auth);
      if (!result.ok) {
        sendRoomError(socket, result.code);
        logAudit({
          level: 'warn',
          event: 'ROOM_START',
          result: 'failure',
          reasonCode: result.code,
          roomCode: auth.roomCode,
          pid: auth.pid,
          sid: auth.sid,
          ipHash: context.ipHash,
          requestId,
        });
        return;
      }

      await broadcaster.broadcast(auth.roomCode, {
        type: 'ROOM_LOCKED',
        payload: {
          roomCode: auth.roomCode,
          lockedAt: result.data.lockedAt,
        },
      });

      await publishRoomState(auth.roomCode);

      logAudit({
        level: 'info',
        event: 'ROOM_START',
        result: 'success',
        reasonCode: 'OK',
        roomCode: auth.roomCode,
        pid: auth.pid,
        sid: auth.sid,
        ipHash: context.ipHash,
        requestId,
      });
    }
  };

  const handleClose = async (socket: WebSocket): Promise<void> => {
    const context = socketContext.get(socket);
    if (!context) {
      return;
    }

    socketContext.delete(socket);

    if (!context.auth) {
      return;
    }

    const auth = context.auth;
    broadcaster.removeSocket(auth.roomCode, socket);

    const currentSocket = sessionSockets.get(auth.sid);
    if (currentSocket !== socket) {
      return;
    }

    sessionSockets.delete(auth.sid);

    const result = await lobbyService.holdDisconnect(auth);
    if (!result.ok) {
      if (result.code !== 'ROOM_NOT_FOUND') {
        logAudit({
          level: 'warn',
          event: 'DISCONNECT_HOLD',
          result: 'failure',
          reasonCode: result.code,
          roomCode: auth.roomCode,
          pid: auth.pid,
          sid: auth.sid,
          ipHash: context.ipHash,
          requestId: context.requestId,
        });
      }
      return;
    }

    await publishRoomState(auth.roomCode);

    logAudit({
      level: 'info',
      event: 'DISCONNECT_HOLD',
      result: 'success',
      reasonCode: 'OK',
      roomCode: auth.roomCode,
      pid: auth.pid,
      sid: auth.sid,
      ipHash: context.ipHash,
      requestId: context.requestId,
    });
  };

  wss.on('connection', (socket, request) => {
    const ip = parseIp(request);
    const ipHashValue = hashIp(ip);
    const connectionRequestId = randomUUID();

    let initialized = false;
    let closed = false;
    const pendingMessages: RawData[] = [];
    const maxPendingMessages = 8;

    const runHandleMessage = (data: RawData) => {
      handleMessage(socket, data).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'unknown error';
        sendRoomError(socket, 'INTERNAL_ERROR');
        logAudit({
          level: 'error',
          event: 'MESSAGE',
          result: 'failure',
          reasonCode: 'INTERNAL_ERROR',
          ipHash: ipHashValue,
          requestId: randomUUID(),
          detail: message,
        });
      });
    };

    socket.on('message', (data) => {
      if (!initialized) {
        if (pendingMessages.length >= maxPendingMessages) {
          socket.close(1008, 'INIT_QUEUE_OVERFLOW');
          return;
        }
        pendingMessages.push(data);
        return;
      }

      runHandleMessage(data);
    });

    socket.on('close', () => {
      closed = true;

      handleClose(socket).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'unknown error';
        logAudit({
          level: 'error',
          event: 'CLOSE',
          result: 'failure',
          reasonCode: 'INTERNAL_ERROR',
          ipHash: ipHashValue,
          requestId: randomUUID(),
          detail: message,
        });
      });
    });

    (async () => {
      const origin = request.headers.origin;
      if (!isOriginAllowed(typeof origin === 'string' ? origin : undefined)) {
        socket.close(1008, 'ORIGIN_NOT_ALLOWED');
        return;
      }

      const connectAllowed = await rateLimiter.allow(
        'connect',
        ipHashValue,
        config.rateLimits.connectPerMin,
        60_000,
      );

      if (!connectAllowed) {
        socket.close(1008, 'RATE_LIMITED');
        logAudit({
          level: 'warn',
          event: 'CONNECT',
          result: 'failure',
          reasonCode: 'RATE_LIMITED',
          ipHash: ipHashValue,
          requestId: connectionRequestId,
        });
        return;
      }

      if (closed || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      socketContext.set(socket, {
        ip,
        ipHash: ipHashValue,
        requestId: connectionRequestId,
      });

      initialized = true;
      while (pendingMessages.length > 0) {
        const next = pendingMessages.shift();
        if (!next) {
          break;
        }
        runHandleMessage(next);
      }
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown error';
      logAudit({
        level: 'error',
        event: 'CONNECT',
        result: 'failure',
        reasonCode: 'INTERNAL_ERROR',
        ipHash: ipHashValue,
        requestId: connectionRequestId,
        detail: message,
      });
      if (!closed && socket.readyState === WebSocket.OPEN) {
        socket.close(1011, 'CONNECT_INIT_FAILED');
      }
    });
  });
};

process.on('uncaughtException', (error) => {
  logSystem('uncaughtException', { error: error.message });
});

process.on('unhandledRejection', (error) => {
  const message = error instanceof Error ? error.message : 'unknown rejection';
  logSystem('unhandledRejection', { error: message });
});

bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : 'unknown bootstrap error';
  logSystem('Failed to bootstrap server', { error: message });
  process.exitCode = 1;
});
