import { createHmac } from 'crypto';
import { SessionClaims } from '../types/domain';

interface VerifySuccess {
  ok: true;
  claims: SessionClaims;
}

interface VerifyFailure {
  ok: false;
  code: 'TOKEN_INVALID' | 'TOKEN_EXPIRED';
}

const base64urlEncode = (value: string): string => {
  return Buffer.from(value, 'utf8').toString('base64url');
};

const base64urlDecode = (value: string): string | null => {
  try {
    return Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return null;
  }
};

const sign = (encodedPayload: string, secret: string): string => {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
};

export const issueSessionToken = (claims: SessionClaims, secret: string): string => {
  const encodedPayload = base64urlEncode(JSON.stringify(claims));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
};

export const verifySessionToken = (
  token: string,
  secret: string,
  nowSeconds: number,
): VerifySuccess | VerifyFailure => {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return {
      ok: false,
      code: 'TOKEN_INVALID',
    };
  }

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) {
    return {
      ok: false,
      code: 'TOKEN_INVALID',
    };
  }

  const expected = sign(encodedPayload, secret);
  if (expected !== signature) {
    return {
      ok: false,
      code: 'TOKEN_INVALID',
    };
  }

  const rawPayload = base64urlDecode(encodedPayload);
  if (!rawPayload) {
    return {
      ok: false,
      code: 'TOKEN_INVALID',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    return {
      ok: false,
      code: 'TOKEN_INVALID',
    };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as SessionClaims).sid !== 'string' ||
    typeof (parsed as SessionClaims).pid !== 'string' ||
    typeof (parsed as SessionClaims).roomCode !== 'string' ||
    typeof (parsed as SessionClaims).role !== 'string' ||
    typeof (parsed as SessionClaims).exp !== 'number'
  ) {
    return {
      ok: false,
      code: 'TOKEN_INVALID',
    };
  }

  const claims = parsed as SessionClaims;

  if (claims.exp <= nowSeconds) {
    return {
      ok: false,
      code: 'TOKEN_EXPIRED',
    };
  }

  return {
    ok: true,
    claims,
  };
};
