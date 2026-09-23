import { errors, jwtVerify, SignJWT } from 'jose';
import type { Config } from '../config/env.js';
import { UnauthorizedError } from '../errors/app-error.js';

/** `iss` claim of every token issued by this API. */
export const TOKEN_ISSUER = 'driver-docs';
/** `aud` claim: tokens are only valid for this API. */
export const TOKEN_AUDIENCE = 'driver-docs-api';
/** The only accepted signing algorithm (HMAC-SHA256); `none` and others are rejected. */
const ALGORITHM = 'HS256';

/** Multipliers of the time units allowed in `JWT_EXPIRES_IN`. */
const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/**
 * Converts a duration like `15m`, `1h` or `7d` into seconds.
 *
 * @param duration - Number followed by `s`, `m`, `h` or `d` (validated by the config schema).
 * @returns The duration in whole seconds.
 * @throws {Error} If the format is not recognized.
 */
export function durationToSeconds(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  return Number(match[1]) * UNIT_SECONDS[match[2] as keyof typeof UNIT_SECONDS];
}

/** A freshly issued access token. */
export interface IssuedToken {
  token: string;
  /** Lifetime in seconds. */
  expiresIn: number;
}

/** Issues and verifies JWT access tokens (HS256, shared secret from the config). */
export class TokenService {
  private readonly key: Uint8Array;
  private readonly expiresIn: number;

  /** @param jwt - Signing secret and token lifetime from the application config. */
  constructor(jwt: Config['jwt']) {
    this.key = new TextEncoder().encode(jwt.secret);
    this.expiresIn = durationToSeconds(jwt.expiresIn);
  }

  /**
   * Issues an access token for a user.
   *
   * @param userId - Becomes the `sub` claim.
   * @returns The signed token (claims `sub`, `iss`, `aud`, `iat`, `exp`) and its lifetime.
   */
  async issue(userId: string): Promise<IssuedToken> {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(TOKEN_ISSUER)
      .setAudience(TOKEN_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + this.expiresIn)
      .sign(this.key);
    return { token, expiresIn: this.expiresIn };
  }

  /**
   * Verifies a token's signature, algorithm, issuer, audience and expiry.
   *
   * @param token - Compact JWT from the `Authorization: Bearer` header.
   * @returns The user id from the `sub` claim.
   * @throws {UnauthorizedError} `TOKEN_EXPIRED` for an expired token, `UNAUTHORIZED`
   *   for any other problem (bad signature, wrong algorithm/issuer/audience,
   *   malformed token, missing `sub`).
   */
  async verify(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        requiredClaims: ['sub', 'exp', 'iat'],
      });
      return payload.sub as string;
    } catch (error) {
      if (error instanceof errors.JWTExpired) {
        throw new UnauthorizedError('Access token has expired', 'TOKEN_EXPIRED');
      }
      throw new UnauthorizedError('Invalid access token');
    }
  }
}
