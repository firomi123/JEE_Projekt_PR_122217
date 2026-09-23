import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/context.js';
import { loginAs } from './helpers/users.js';

/** A fully filled-in profile, as a driver would type it. */
const filledProfile = {
  firstName: 'Jan',
  lastName: 'Kowalski',
  phone: '+48 601 234 567',
  licenseNumber: '00123/15/1465',
  companyName: 'Trans-Pol Sp. z o.o.',
};

const EMPTY_PROFILE = {
  firstName: null,
  lastName: null,
  phone: null,
  licenseNumber: null,
  companyName: null,
  updatedAt: expect.any(String),
};

describe('driver profile created at registration', () => {
  const { app, prisma } = useTestApp();

  it('gives a newly registered account an empty profile', async () => {
    await request(app).post('/api/auth/register').send({
      username: 'jan_kowalski',
      email: 'jan@example.com',
      password: 'Tajne123!',
      confirmPassword: 'Tajne123!',
    });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'jan_kowalski', password: 'Tajne123!' });

    const response = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ profile: EMPTY_PROFILE });
    expect(await prisma.driverProfile.count()).toBe(1);
  });

  it('deletes the profile together with the account', async () => {
    const { user } = await loginAs(app, prisma);

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.driverProfile.count()).toBe(0);
  });
});

describe('GET /api/profile', () => {
  const { app, prisma } = useTestApp();

  it('returns the own profile', async () => {
    const { user, authHeader } = await loginAs(app, prisma);
    await prisma.driverProfile.update({
      where: { userId: user.id },
      data: { firstName: 'Jan', companyName: 'Trans-Pol' },
    });

    const response = await request(app).get('/api/profile').set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body.profile).toMatchObject({ firstName: 'Jan', companyName: 'Trans-Pol' });
  });

  it('returns 401 without a token', async () => {
    const response = await request(app).get('/api/profile');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when the account behind the token no longer exists', async () => {
    const { user, authHeader } = await loginAs(app, prisma);
    await prisma.user.delete({ where: { id: user.id } });

    const response = await request(app).get('/api/profile').set('Authorization', authHeader);

    expect(response.status).toBe(401);
  });
});

describe('PUT /api/profile', () => {
  const { app, prisma } = useTestApp();

  it('updates the own profile, returns it normalized and persists it', async () => {
    const { authHeader } = await loginAs(app, prisma);

    const response = await request(app)
      .put('/api/profile')
      .set('Authorization', authHeader)
      .send(filledProfile);

    const expected = {
      firstName: 'Jan',
      lastName: 'Kowalski',
      phone: '+48601234567',
      licenseNumber: '00123/15/1465',
      companyName: 'Trans-Pol Sp. z o.o.',
      updatedAt: expect.any(String),
    };
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ profile: expected });
    const reread = await request(app).get('/api/profile').set('Authorization', authHeader);
    expect(reread.body).toEqual({ profile: expected });
  });

  it('stores Polish characters unchanged', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const polish = {
      firstName: 'Łukasz',
      lastName: 'Wiśniewska-Żółć',
      companyName: 'Przewozy Ślęża',
    };

    await request(app).put('/api/profile').set('Authorization', authHeader).send(polish);
    const response = await request(app).get('/api/profile').set('Authorization', authHeader);

    expect(response.body.profile).toMatchObject(polish);
  });

  it('replaces the whole profile: omitted and blank fields are cleared', async () => {
    const { authHeader } = await loginAs(app, prisma);
    await request(app).put('/api/profile').set('Authorization', authHeader).send(filledProfile);

    const response = await request(app)
      .put('/api/profile')
      .set('Authorization', authHeader)
      .send({ firstName: 'Janusz', companyName: '   ' });

    expect(response.status).toBe(200);
    expect(response.body.profile).toEqual({ ...EMPTY_PROFILE, firstName: 'Janusz' });
  });

  it('changes only the profile of the token owner', async () => {
    const jan = await loginAs(app, prisma);
    const anna = await loginAs(app, prisma);

    await request(app).put('/api/profile').set('Authorization', jan.authHeader).send(filledProfile);

    const annaProfile = await request(app)
      .get('/api/profile')
      .set('Authorization', anna.authHeader);
    expect(annaProfile.body.profile).toEqual(EMPTY_PROFILE);
  });

  it('ignores unknown fields such as userId (cannot move the profile to another account)', async () => {
    const jan = await loginAs(app, prisma);
    const anna = await loginAs(app, prisma);

    const response = await request(app)
      .put('/api/profile')
      .set('Authorization', jan.authHeader)
      .send({ firstName: 'Jan', userId: anna.user.id, id: anna.user.id });

    expect(response.status).toBe(200);
    const annaRow = await prisma.driverProfile.findUniqueOrThrow({
      where: { userId: anna.user.id },
    });
    expect(annaRow.firstName).toBeNull();
  });

  it('returns 400 with per-field details for invalid data and changes nothing', async () => {
    const { user, authHeader } = await loginAs(app, prisma);

    const response = await request(app)
      .put('/api/profile')
      .set('Authorization', authHeader)
      .send({
        firstName: 'J4n',
        lastName: 'x'.repeat(81),
        phone: 'abc',
        licenseNumber: '12',
        companyName: 'OK',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'firstName',
      'lastName',
      'licenseNumber',
      'phone',
    ]);
    const row = await prisma.driverProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row.companyName).toBeNull();
  });

  it('returns 401 without a token', async () => {
    const response = await request(app).put('/api/profile').send(filledProfile);

    expect(response.status).toBe(401);
  });
});
