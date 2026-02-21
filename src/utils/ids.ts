import { randomBytes, randomUUID } from 'crypto';
import { Team } from '../types/domain';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const generateRoomCode = (): string => {
  const bytes = randomBytes(6);
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && output.length < 6) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (output.length >= 6) {
      break;
    }
  }

  while (output.length < 6) {
    output += BASE32_ALPHABET[Math.floor(Math.random() * BASE32_ALPHABET.length)];
  }

  return output;
};

export const generatePid = (): string => {
  return `pid_${randomUUID().replace(/-/g, '')}`;
};

export const generateSid = (): string => {
  return `sid_${randomUUID().replace(/-/g, '')}`;
};

export const chooseDefaultTeam = (preferredTeam: Team | null | undefined): Team => {
  if (preferredTeam === 'A' || preferredTeam === 'B') {
    return preferredTeam;
  }
  return 'A';
};
