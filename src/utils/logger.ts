import { ErrorCode } from '../types/domain';

export interface AuditLogEntry {
  level: 'info' | 'warn' | 'error';
  event: string;
  result: 'success' | 'failure';
  reasonCode?: ErrorCode | 'OK';
  roomCode?: string;
  pid?: string;
  sid?: string;
  ipHash?: string;
  requestId?: string;
  detail?: string;
}

export const logAudit = (entry: AuditLogEntry): void => {
  const payload = {
    ts: new Date().toISOString(),
    ...entry,
  };

  console.log(JSON.stringify(payload));
};

export const logSystem = (message: string, extra?: Record<string, string | number | boolean>): void => {
  const payload = {
    ts: new Date().toISOString(),
    level: 'info',
    event: 'SYSTEM',
    message,
    ...(extra || {}),
  };
  console.log(JSON.stringify(payload));
};
