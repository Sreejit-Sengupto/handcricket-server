import { WebSocket } from 'ws';
import { keys, parseRoomCodeFromChannel } from '../infra/redis/keys';
import { RedisCommands, RedisSubscriber, SubscriberMessage } from '../infra/redis/resp';
import { ServerEvent } from '../types/protocol';
import { logSystem } from '../utils/logger';

interface BroadcastEnvelope {
  sourceId: string;
  event: ServerEvent;
}

export class RoomBroadcaster {
  private readonly sourceId: string;

  private readonly publisher: RedisCommands;

  private readonly roomSockets = new Map<string, Set<WebSocket>>();

  constructor(sourceId: string, publisher: RedisCommands) {
    this.sourceId = sourceId;
    this.publisher = publisher;
  }

  async attachSubscriber(subscriber: RedisSubscriber): Promise<void> {
    await subscriber.psubscribe(keys.roomEventsPattern, (message) => {
      this.handleSubscriberMessage(message);
    });
  }

  addSocket(roomCode: string, socket: WebSocket): void {
    const existing = this.roomSockets.get(roomCode);
    if (existing) {
      existing.add(socket);
      return;
    }

    this.roomSockets.set(roomCode, new Set([socket]));
  }

  removeSocket(roomCode: string, socket: WebSocket): void {
    const existing = this.roomSockets.get(roomCode);
    if (!existing) {
      return;
    }

    existing.delete(socket);
    if (existing.size === 0) {
      this.roomSockets.delete(roomCode);
    }
  }

  async broadcast(roomCode: string, event: ServerEvent): Promise<void> {
    this.broadcastLocal(roomCode, event);

    const envelope: BroadcastEnvelope = {
      sourceId: this.sourceId,
      event,
    };

    await this.publisher.publish(keys.roomEventsChannel(roomCode), JSON.stringify(envelope));
  }

  broadcastLocal(roomCode: string, event: ServerEvent): void {
    const sockets = this.roomSockets.get(roomCode);
    if (!sockets || sockets.size === 0) {
      return;
    }

    const payload = JSON.stringify(event);

    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }

  private handleSubscriberMessage(message: SubscriberMessage): void {
    const roomCode = parseRoomCodeFromChannel(message.channel);
    if (!roomCode) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(message.payload);
    } catch {
      logSystem('Failed to parse pubsub payload', { channel: message.channel });
      return;
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as BroadcastEnvelope).sourceId !== 'string' ||
      typeof (parsed as BroadcastEnvelope).event !== 'object'
    ) {
      return;
    }

    const envelope = parsed as BroadcastEnvelope;
    if (envelope.sourceId === this.sourceId) {
      return;
    }

    this.broadcastLocal(roomCode, envelope.event);
  }
}
