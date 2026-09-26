import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { OfficeDocumentDetailsDto } from '@driver-docs/shared';
import { createLogger } from '../src/lib/logger.js';
import { verifyPassword } from '../src/lib/password.js';
import { UserRepository } from '../src/repositories/user.repository.js';
import { ensureOfficeAccount } from '../src/services/office-account.js';
import { useTestApp } from './helpers/context.js';
import { createDocument, downloadFile } from './helpers/documents.js';
import { jpegFile } from './fixtures/files.js';
import { createUser, DEFAULT_PASSWORD, loginAs, loginAsOffice } from './helpers/users.js';

describe('roles and access', () => {
  const { app, prisma } = useTestApp();

  it('creates every publicly registered account as a driver', async () => {
    const response = await request(app).post('/api/auth/register').send({
      username: 'nowy_kierowca',
      email: 'nowy@example.com',
      password: DEFAULT_PASSWORD,
      confirmPassword: DEFAULT_PASSWORD,
    });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('DRIVER');
  });

  it('returns the role at login and from /api/auth/me', async () => {
    const office = await createUser(prisma, { role: 'OFFICE' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: office.username, password: DEFAULT_PASSWORD });

    expect(login.body.user.role).toBe('OFFICE');
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.body.user.role).toBe('OFFICE');
  });

  it('answers 401 without a token and 403 FORBIDDEN for a driver on every office endpoint', async () => {
    const driver = await loginAs(app, prisma);
    const document = await createDocument(app, driver.authHeader);
    const endpoints = [
      () => request(app).get('/api/office/documents'),
      () => request(app).get('/api/office/drivers'),
      () => request(app).get(`/api/office/documents/${document.id}`),
      () => request(app).get(`/api/office/documents/${document.id}/versions/1/file`),
      () =>
        request(app)
          .post(`/api/office/documents/${document.id}/review`)
          .send({ decision: 'ACCEPTED' }),
    ];

    for (const endpoint of endpoints) {
      const anonymous = await endpoint();
      expect(anonymous.status).toBe(401);
      const asDriver = await endpoint().set('Authorization', driver.authHeader);
      expect(asDriver.status).toBe(403);
      expect(asDriver.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('keeps the office out of the driver endpoints (403 FORBIDDEN)', async () => {
    const office = await loginAsOffice(app, prisma);

    for (const response of [
      await request(app).get('/api/documents').set('Authorization', office.authHeader),
      await request(app).get('/api/profile').set('Authorization', office.authHeader),
    ]) {
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('answers 401 when the account behind a valid token no longer exists', async () => {
    const office = await loginAsOffice(app, prisma);
    await prisma.user.delete({ where: { id: office.user.id } });

    const response = await request(app)
      .get('/api/office/documents')
      .set('Authorization', office.authHeader);

    expect(response.status).toBe(401);
  });
});

describe('GET /api/office/documents', () => {
  const { app, prisma } = useTestApp();

  it("lists every driver's documents with the driver, newest change first, without deleted ones", async () => {
    const office = await loginAsOffice(app, prisma);
    const jan = await loginAs(app, prisma, { username: 'jan_kowalski' });
    const ewa = await loginAs(app, prisma, { username: 'ewa_nowak' });
    await request(app)
      .put('/api/profile')
      .set('Authorization', jan.authHeader)
      .send({ firstName: 'Jan', lastName: 'Kowalski', companyName: 'Trans-Pol' });
    const first = await createDocument(app, jan.authHeader, { title: 'CMR Jana' });
    const second = await createDocument(app, ewa.authHeader, { title: 'WZ Ewy', type: 'WZ' });
    const deleted = await createDocument(app, ewa.authHeader, { title: 'Usunięty' });
    await request(app).delete(`/api/documents/${deleted.id}`).set('Authorization', ewa.authHeader);

    const response = await request(app)
      .get('/api/office/documents')
      .set('Authorization', office.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(response.body.items[1]).toMatchObject({
      title: 'CMR Jana',
      status: 'DRAFT',
      owner: {
        id: jan.user.id,
        username: 'jan_kowalski',
        firstName: 'Jan',
        lastName: 'Kowalski',
        companyName: 'Trans-Pol',
      },
    });
  });

  it('filters by status, driver, type and text', async () => {
    const office = await loginAsOffice(app, prisma);
    const jan = await loginAs(app, prisma);
    const ewa = await loginAs(app, prisma);
    const submitted = await createDocument(app, jan.authHeader, { title: 'Do sprawdzenia' });
    await request(app)
      .patch(`/api/documents/${submitted.id}`)
      .set('Authorization', jan.authHeader)
      .send({ status: 'SUBMITTED' });
    await createDocument(app, jan.authHeader, { title: 'Roboczy', type: 'WZ' });
    const ewas = await createDocument(app, ewa.authHeader, {
      title: 'Faktura Ewy',
      number: 'FV/9',
    });

    /**
     * Lists office documents with a query string.
     * @param query - Query string without `?`.
     * @returns Titles of the listed documents.
     */
    const titles = async (query: string) =>
      (
        await request(app)
          .get(`/api/office/documents?${query}`)
          .set('Authorization', office.authHeader)
      ).body.items.map((item: { title: string }) => item.title);

    expect(await titles('status=SUBMITTED')).toEqual(['Do sprawdzenia']);
    expect(await titles(`driverId=${ewa.user.id}`)).toEqual([ewas.title]);
    expect(await titles('type=WZ')).toEqual(['Roboczy']);
    expect(await titles('q=fv/9')).toEqual(['Faktura Ewy']);
  });

  it('rejects a malformed driver filter (400 with the field)', async () => {
    const office = await loginAsOffice(app, prisma);

    const response = await request(app)
      .get('/api/office/documents?driverId=jan')
      .set('Authorization', office.authHeader);

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([expect.objectContaining({ path: 'driverId' })]);
  });
});

describe('GET /api/office/drivers', () => {
  const { app, prisma } = useTestApp();

  it('lists the drivers (not office accounts) with their names, by username', async () => {
    const office = await loginAsOffice(app, prisma, { username: 'biuro_testowe' });
    const zenon = await createUser(prisma, { username: 'zenon' });
    await createUser(prisma, { username: 'adam' });
    await prisma.driverProfile.update({
      where: { userId: zenon.id },
      data: { firstName: 'Zenon', lastName: 'Zając' },
    });

    const response = await request(app)
      .get('/api/office/drivers')
      .set('Authorization', office.authHeader);

    expect(response.status).toBe(200);
    expect(response.body.drivers).toEqual([
      expect.objectContaining({ username: 'adam', firstName: null }),
      expect.objectContaining({
        id: zenon.id,
        username: 'zenon',
        firstName: 'Zenon',
        lastName: 'Zając',
      }),
    ]);
  });
});

describe('GET /api/office/documents/:id and its files', () => {
  const { app, prisma } = useTestApp();

  it('shows any driver’s document with the driver’s contact data, versions and history', async () => {
    const office = await loginAsOffice(app, prisma);
    const driver = await loginAs(app, prisma, { username: 'kierowca_1' });
    await request(app)
      .put('/api/profile')
      .set('Authorization', driver.authHeader)
      .send({ firstName: 'Jan', lastName: 'Kowalski', phone: '+48 601 234 567' });
    const document = await createDocument(app, driver.authHeader, { title: 'CMR 1' });

    const response = await request(app)
      .get(`/api/office/documents/${document.id}`)
      .set('Authorization', office.authHeader);

    expect(response.status).toBe(200);
    const details = response.body.document as OfficeDocumentDetailsDto;
    expect(details).toMatchObject({
      id: document.id,
      title: 'CMR 1',
      versions: [expect.objectContaining({ versionNo: 1 })],
      owner: {
        username: 'kierowca_1',
        firstName: 'Jan',
        lastName: 'Kowalski',
        phone: '+48601234567',
      },
    });
    expect(details.history).toEqual([
      expect.objectContaining({
        action: 'CREATED',
        comment: null,
        changedBy: { username: 'kierowca_1', role: 'DRIVER' },
      }),
    ]);
  });

  it.each([
    ['an unknown id', '5f0e7c7a-0000-4000-8000-000000000000'],
    ['a malformed id', 'not-a-uuid'],
    ['a deleted document', 'deleted'],
  ])('returns 404 NOT_FOUND for %s', async (_case, idKind) => {
    const office = await loginAsOffice(app, prisma);
    const driver = await loginAs(app, prisma);
    const document = await createDocument(app, driver.authHeader);
    await request(app)
      .delete(`/api/documents/${document.id}`)
      .set('Authorization', driver.authHeader);
    const id = idKind === 'deleted' ? document.id : idKind;

    const response = await request(app)
      .get(`/api/office/documents/${id}`)
      .set('Authorization', office.authHeader);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('downloads the decrypted file exactly as the driver uploaded it', async () => {
    const office = await loginAsOffice(app, prisma);
    const driver = await loginAs(app, prisma);
    const photo = jpegFile(20_000);
    const document = await createDocument(app, driver.authHeader, {
      file: photo,
      filename: 'zdjecie.jpg',
      contentType: 'image/jpeg',
    });

    const response = await downloadFile(
      app,
      office.authHeader,
      document.id,
      '1',
      '',
      '/api/office/documents',
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.compare(response.body as Buffer, photo)).toBe(0);
    const missing = await downloadFile(
      app,
      office.authHeader,
      document.id,
      '2',
      '',
      '/api/office/documents',
    );
    expect(missing.status).toBe(404);
  });
});

describe('POST /api/office/documents/:id/review', () => {
  const { app, prisma } = useTestApp();

  /**
   * Creates a driver with one document and submits it to the office.
   * @returns The driver and the submitted document.
   */
  async function submittedDocument() {
    const driver = await loginAs(app, prisma);
    const document = await createDocument(app, driver.authHeader);
    await request(app)
      .patch(`/api/documents/${document.id}`)
      .set('Authorization', driver.authHeader)
      .send({ status: 'SUBMITTED' });
    return { driver, document };
  }

  it('accepts a submitted document and records who did it', async () => {
    const office = await loginAsOffice(app, prisma, { username: 'biuro_anna' });
    const { document } = await submittedDocument();

    const response = await request(app)
      .post(`/api/office/documents/${document.id}/review`)
      .set('Authorization', office.authHeader)
      .send({ decision: 'ACCEPTED' });

    expect(response.status).toBe(200);
    expect(response.body.document.status).toBe('ACCEPTED');
    expect(response.body.document.history[0]).toMatchObject({
      action: 'STATUS_CHANGED',
      oldValue: 'SUBMITTED',
      newValue: 'ACCEPTED',
      comment: null,
      changedBy: { username: 'biuro_anna', role: 'OFFICE' },
    });
  });

  it('rejects with a reason that the driver then sees in the history', async () => {
    const office = await loginAsOffice(app, prisma);
    const { driver, document } = await submittedDocument();

    const response = await request(app)
      .post(`/api/office/documents/${document.id}/review`)
      .set('Authorization', office.authHeader)
      .send({ decision: 'REJECTED', comment: '  Brak pieczątki odbiorcy ' });

    expect(response.status).toBe(200);
    expect(response.body.document.status).toBe('REJECTED');
    const seenByDriver = await request(app)
      .get(`/api/documents/${document.id}`)
      .set('Authorization', driver.authHeader);
    expect(seenByDriver.body.document.status).toBe('REJECTED');
    expect(seenByDriver.body.document.history[0]).toMatchObject({
      newValue: 'REJECTED',
      comment: 'Brak pieczątki odbiorcy',
      changedBy: { role: 'OFFICE' },
    });
  });

  it('requires the reason of a rejection (400) and changes nothing without it', async () => {
    const office = await loginAsOffice(app, prisma);
    const { document } = await submittedDocument();

    const response = await request(app)
      .post(`/api/office/documents/${document.id}/review`)
      .set('Authorization', office.authHeader)
      .send({ decision: 'REJECTED' });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { path: 'comment', message: 'Podaj powód odrzucenia' },
    ]);
    const row = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(row.status).toBe('SUBMITTED');
  });

  it('only reviews submitted documents (409 INVALID_STATUS_TRANSITION)', async () => {
    const office = await loginAsOffice(app, prisma);
    const driver = await loginAs(app, prisma);
    const draft = await createDocument(app, driver.authHeader);
    const { document: reviewed } = await submittedDocument();
    await request(app)
      .post(`/api/office/documents/${reviewed.id}/review`)
      .set('Authorization', office.authHeader)
      .send({ decision: 'ACCEPTED' });

    for (const id of [draft.id, reviewed.id]) {
      const response = await request(app)
        .post(`/api/office/documents/${id}/review`)
        .set('Authorization', office.authHeader)
        .send({ decision: 'REJECTED', comment: 'Za późno' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    }
    const row = await prisma.document.findUniqueOrThrow({ where: { id: reviewed.id } });
    expect(row.status).toBe('ACCEPTED');
  });

  it('lets only one of two simultaneous reviews win', async () => {
    const office = await loginAsOffice(app, prisma);
    const { document } = await submittedDocument();

    const responses = await Promise.all(
      (['ACCEPTED', 'REJECTED'] as const).map((decision) =>
        request(app)
          .post(`/api/office/documents/${document.id}/review`)
          .set('Authorization', office.authHeader)
          .send({ decision, comment: 'Decyzja' }),
      ),
    );

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const history = await prisma.documentHistory.findMany({
      where: {
        documentId: document.id,
        action: 'STATUS_CHANGED',
        oldValue: 'SUBMITTED',
        newValue: { in: ['ACCEPTED', 'REJECTED'] },
      },
    });
    expect(history).toHaveLength(1);
  });

  it('supports the full loop: reject → driver corrects and resubmits → accept', async () => {
    const office = await loginAsOffice(app, prisma);
    const { driver, document } = await submittedDocument();
    await request(app)
      .post(`/api/office/documents/${document.id}/review`)
      .set('Authorization', office.authHeader)
      .send({ decision: 'REJECTED', comment: 'Nieczytelne zdjęcie' });

    await request(app)
      .post(`/api/documents/${document.id}/versions`)
      .set('Authorization', driver.authHeader)
      .attach('file', jpegFile(5_000), { filename: 'lepsze.jpg', contentType: 'image/jpeg' });
    const resubmitted = await request(app)
      .patch(`/api/documents/${document.id}`)
      .set('Authorization', driver.authHeader)
      .send({ status: 'SUBMITTED' });
    expect(resubmitted.status).toBe(200);

    const accepted = await request(app)
      .post(`/api/office/documents/${document.id}/review`)
      .set('Authorization', office.authHeader)
      .send({ decision: 'ACCEPTED' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.document).toMatchObject({ status: 'ACCEPTED', currentVersion: 2 });
  });
});

describe('ensureOfficeAccount (office account from the configuration)', () => {
  const { prisma } = useTestApp();
  const logger = createLogger({ logLevel: 'silent', nodeEnv: 'test' });
  const office = { username: 'biuro', email: 'biuro@office.invalid', password: 'Biuro-Haslo1!' };

  it('does nothing when no office account is configured', async () => {
    expect(await ensureOfficeAccount(new UserRepository(prisma), null, logger)).toBe('disabled');
    expect(await prisma.user.count()).toBe(0);
  });

  it('creates the office account once, with the configured password', async () => {
    const users = new UserRepository(prisma);

    expect(await ensureOfficeAccount(users, office, logger)).toBe('created');
    expect(await ensureOfficeAccount(users, office, logger)).toBe('unchanged');

    const rows = await prisma.user.findMany({ where: { username: 'biuro' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: 'OFFICE', email: 'biuro@office.invalid' });
    expect(await verifyPassword(rows[0]!.passwordHash, 'Biuro-Haslo1!')).toBe(true);
  });

  it('updates the password when it was changed in the configuration', async () => {
    const users = new UserRepository(prisma);
    await ensureOfficeAccount(users, office, logger);

    const result = await ensureOfficeAccount(
      users,
      { ...office, password: 'Nowe-Haslo2@' },
      logger,
    );

    expect(result).toBe('password-updated');
    const row = await prisma.user.findUniqueOrThrow({ where: { username: 'biuro' } });
    expect(await verifyPassword(row.passwordHash, 'Nowe-Haslo2@')).toBe(true);
  });

  it('never turns an existing driver account with the same login into an office account', async () => {
    await createUser(prisma, { username: 'biuro' });

    const result = await ensureOfficeAccount(new UserRepository(prisma), office, logger);

    expect(result).toBe('conflict');
    const row = await prisma.user.findUniqueOrThrow({ where: { username: 'biuro' } });
    expect(row.role).toBe('DRIVER');
    expect(await verifyPassword(row.passwordHash, 'Biuro-Haslo1!')).toBe(false);
  });
});
