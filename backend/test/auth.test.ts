import { SignJWT, decodeJwt } from 'jose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, useTestApp, type TestContext } from './helpers/context.js';
import { createUser, DEFAULT_PASSWORD, loginAs } from './helpers/users.js';
import { testEnv } from './env.js';

/** A valid registration body; tests change single fields. */
const registration = {
  username: 'jan_kowalski',
  email: 'jan@example.com',
  password: 'Tajne123!',
  confirmPassword: 'Tajne123!',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Signs a JWT with the given claims, secret and lifetime, bypassing the API.
 * Used to craft expired or foreign tokens.
 *
 * @param claims - `sub` plus optional issuer/audience overrides.
 * @param options - Signing secret (defaults to the test JWT_SECRET) and expiry.
 * @returns The compact JWT string.
 */
async function craftToken(
  claims: { sub: string; iss?: string; aud?: string },
  options: { secret?: string; expiresAt?: number | string } = {},
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(claims.iss ?? 'driver-docs')
    .setAudience(claims.aud ?? 'driver-docs-api')
    .setIssuedAt()
    .setExpirationTime(options.expiresAt ?? '1h')
    .sign(new TextEncoder().encode(options.secret ?? testEnv.JWT_SECRET));
}

describe('POST /api/auth/register', () => {
  const { app, prisma } = useTestApp();

  it('creates the account and returns 201 with the user without the password', async () => {
    const response = await request(app).post('/api/auth/register').send(registration);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      user: {
        id: expect.stringMatching(UUID),
        username: 'jan_kowalski',
        email: 'jan@example.com',
        role: 'DRIVER',
        createdAt: expect.any(String),
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/password|hash/i);
  });

  it('stores only an argon2id hash of the password', async () => {
    await request(app).post('/api/auth/register').send(registration);

    const stored = await prisma.user.findUniqueOrThrow({ where: { username: 'jan_kowalski' } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored.passwordHash).not.toContain(registration.password);
  });

  it('normalizes the username and e-mail to lowercase', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...registration, username: 'Jan_Kowalski', email: 'Jan@Example.com' });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      username: 'jan_kowalski',
      email: 'jan@example.com',
    });
  });

  it('returns 409 with details on the username field when the username is taken', async () => {
    await createUser(prisma, { username: 'jan_kowalski' });

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...registration, username: 'JAN_Kowalski', email: 'other@example.com' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'CONFLICT',
        message: expect.any(String),
        details: [{ path: 'username', message: 'Ten login jest już zajęty' }],
      },
    });
  });

  it('returns 409 with details on the email field when the e-mail is taken', async () => {
    await createUser(prisma, { email: 'jan@example.com' });

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...registration, email: 'JAN@example.com' });

    expect(response.status).toBe(409);
    expect(response.body.error.details).toEqual([
      { path: 'email', message: 'Konto z tym adresem e-mail już istnieje' },
    ]);
  });

  it('reports both fields when username and e-mail are taken', async () => {
    await createUser(prisma, { username: 'jan_kowalski', email: 'jan@example.com' });

    const response = await request(app).post('/api/auth/register').send(registration);

    expect(response.status).toBe(409);
    expect(response.body.error.details.map((d: { path: string }) => d.path)).toEqual([
      'username',
      'email',
    ]);
  });

  it('returns 400 VALIDATION_ERROR with per-field details for invalid data', async () => {
    const response = await request(app).post('/api/auth/register').send({
      username: 'ab',
      email: 'not-an-email',
      password: 'weak',
      confirmPassword: 'different',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const fields = new Set(response.body.error.details.map((d: { path: string }) => d.path));
    expect(fields).toEqual(new Set(['username', 'email', 'password', 'confirmPassword']));
    expect(await prisma.user.count()).toBe(0);
  });

  it('returns 400 when the body is empty', async () => {
    const response = await request(app).post('/api/auth/register').send({});

    expect(response.status).toBe(400);
    expect(response.body.error.details).toHaveLength(4);
  });
});

describe('POST /api/auth/login', () => {
  const { app, prisma } = useTestApp();

  it('returns 200 with a Bearer JWT whose sub is the user id and lifetime 1 h', async () => {
    const user = await createUser(prisma, { username: 'jan_kowalski' });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'jan_kowalski', password: DEFAULT_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: {
        id: user.id,
        username: 'jan_kowalski',
        email: user.email,
        role: 'DRIVER',
        createdAt: user.createdAt.toISOString(),
      },
    });
    const claims = decodeJwt(response.body.accessToken);
    expect(claims.sub).toBe(user.id);
    expect(claims.exp! - claims.iat!).toBe(3600);
  });

  it('accepts the username in any letter case', async () => {
    await createUser(prisma, { username: 'jan_kowalski' });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'Jan_Kowalski', password: DEFAULT_PASSWORD });

    expect(response.status).toBe(200);
  });

  it('returns 401 INVALID_CREDENTIALS for a wrong password', async () => {
    await createUser(prisma, { username: 'jan_kowalski' });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'jan_kowalski', password: 'Zle-haslo1' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
    });
    expect(response.body).not.toHaveProperty('accessToken');
  });

  it('answers an unknown username exactly like a wrong password', async () => {
    await createUser(prisma, { username: 'jan_kowalski' });

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ username: 'jan_kowalski', password: 'Zle-haslo1' });
    const unknownUser = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nie_istnieje', password: 'Zle-haslo1' });

    expect(unknownUser.status).toBe(wrongPassword.status);
    expect(unknownUser.body).toEqual(wrongPassword.body);
  });

  it('returns 400 when username or password is missing', async () => {
    const response = await request(app).post('/api/auth/login').send({ username: 'jan' });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { path: 'password', message: expect.any(String) },
    ]);
  });
});

describe('POST /api/auth/login – rate limiting', () => {
  let ctx: TestContext;

  afterEach(async () => {
    await ctx.prisma.$disconnect();
    ctx.s3.destroy();
  });

  it('blocks further attempts from the same IP after the failed-login limit (429)', async () => {
    ctx = buildTestApp({ LOGIN_RATE_LIMIT_MAX: '3' });
    await ctx.prisma.user.deleteMany();
    await createUser(ctx.prisma, { username: 'jan_kowalski' });
    /**
     * Sends one login request for `jan_kowalski` with the given password.
     * @param password - Password to try.
     * @returns The Supertest response (status 200, 401 or 429).
     */
    const attempt = (password: string) =>
      request(ctx.app).post('/api/auth/login').send({ username: 'jan_kowalski', password });

    for (let i = 0; i < 3; i++) expect((await attempt('Zle-haslo1')).status).toBe(401);
    const blocked = await attempt(DEFAULT_PASSWORD);

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: { code: 'TOO_MANY_REQUESTS', message: expect.any(String) },
    });
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('does not count successful logins towards the limit', async () => {
    ctx = buildTestApp({ LOGIN_RATE_LIMIT_MAX: '2' });
    await ctx.prisma.user.deleteMany();
    await createUser(ctx.prisma, { username: 'jan_kowalski' });

    for (let i = 0; i < 5; i++) {
      const response = await request(ctx.app)
        .post('/api/auth/login')
        .send({ username: 'jan_kowalski', password: DEFAULT_PASSWORD });
      expect(response.status).toBe(200);
    }
  });
});

describe('GET /api/auth/me', () => {
  const { app, prisma } = useTestApp();

  it('returns 200 with the current user for a valid token', async () => {
    const { user, authHeader } = await loginAs(app, prisma, { username: 'jan_kowalski' });

    const response = await request(app).get('/api/auth/me').set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: {
        id: user.id,
        username: 'jan_kowalski',
        email: user.email,
        role: 'DRIVER',
        createdAt: user.createdAt.toISOString(),
      },
    });
  });

  it('returns 401 without a token', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it.each([
    ['a non-Bearer scheme', 'Basic amFuOnRham5lMTIzIQ=='],
    ['an empty Bearer token', 'Bearer '],
    ['a malformed token', 'Bearer not.a.jwt'],
  ])('returns 401 for %s', async (_case, header) => {
    const response = await request(app).get('/api/auth/me').set('Authorization', header);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for a token signed with a different secret', async () => {
    const user = await createUser(prisma);
    const token = await craftToken(
      { sub: user.id },
      { secret: 'another-secret-that-is-at-least-32-chars' },
    );

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it('returns 401 TOKEN_EXPIRED for an expired token', async () => {
    const user = await createUser(prisma);
    const token = await craftToken(
      { sub: user.id },
      { expiresAt: Math.floor(Date.now() / 1000) - 60 },
    );

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('returns 401 for a token with a foreign issuer or audience', async () => {
    const user = await createUser(prisma);
    const foreignIssuer = await craftToken({ sub: user.id, iss: 'someone-else' });
    const foreignAudience = await craftToken({ sub: user.id, aud: 'another-api' });

    for (const token of [foreignIssuer, foreignAudience]) {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(401);
    }
  });

  it('returns 401 for an unsigned token (alg "none")', async () => {
    const user = await createUser(prisma);
    /**
     * Encodes a JWT header or payload segment: JSON, then base64url.
     * @param value - Object to encode.
     * @returns The base64url segment (no signature involved).
     */
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
      sub: user.id,
      iss: 'driver-docs',
      aud: 'driver-docs-api',
      iat: now,
      exp: now + 3600,
    })}.`;

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it('returns 401 when the account behind a valid token no longer exists', async () => {
    const { user, authHeader } = await loginAs(app, prisma);
    await prisma.user.delete({ where: { id: user.id } });

    const response = await request(app).get('/api/auth/me').set('Authorization', authHeader);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});
