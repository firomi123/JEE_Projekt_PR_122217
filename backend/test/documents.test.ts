import { createHash } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { exeFile, jpegFile, pdfFile, pngFile } from './fixtures/files.js';
import { useTestApp } from './helpers/context.js';
import {
  createDocument,
  downloadFile,
  overwriteStoredObject,
  readStoredObject,
  uploadDocument,
} from './helpers/documents.js';
import { loginAs } from './helpers/users.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/**
 * Computes the SHA-256 digest of a buffer.
 * @param data - Bytes to hash.
 * @returns The digest as lowercase hex (as stored in `DocumentVersion.sha256`).
 */
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

describe('POST /api/documents (upload)', () => {
  const ctx = useTestApp();
  const { app, prisma } = ctx;

  it('creates a DRAFT document with version 1 and a CREATED history entry', async () => {
    const { authHeader, user } = await loginAs(app, prisma);
    const file = pdfFile();

    const response = await uploadDocument(app, authHeader, {
      file,
      type: 'CMR',
      title: '  CMR Poznań – Berlin ',
      number: 'PL 123/2026',
      changeNote: 'Oryginał z załadunku',
    });

    expect(response.status).toBe(201);
    expect(response.body.document).toEqual({
      id: expect.stringMatching(UUID),
      type: 'CMR',
      status: 'DRAFT',
      title: 'CMR Poznań – Berlin',
      number: 'PL 123/2026',
      currentVersion: 1,
      mimeType: 'application/pdf',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      versions: [
        {
          versionNo: 1,
          mimeType: 'application/pdf',
          sizeBytes: file.length,
          sha256: sha256(file),
          changeNote: 'Oryginał z załadunku',
          createdAt: expect.any(String),
        },
      ],
      history: [
        {
          action: 'CREATED',
          field: null,
          oldValue: null,
          newValue: null,
          comment: null,
          changedBy: { username: user.username, role: 'DRIVER' },
          createdAt: expect.any(String),
        },
      ],
    });
  });

  it('returns the identical bytes on download', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const file = jpegFile(50_000);
    const document = await createDocument(app, authHeader, {
      file,
      filename: 'zdjecie.jpg',
      contentType: 'image/jpeg',
    });

    const response = await downloadFile(app, authHeader, document.id, 1);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.compare(response.body as Buffer, file)).toBe(0);
  });

  it('stores the file in MinIO encrypted (different bytes, no readable content)', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const file = pdfFile('POUFNE-CMR-987654');
    const document = await createDocument(app, authHeader, { file });

    const { bytes } = await readStoredObject(ctx, document.id, 1);

    expect(bytes).toHaveLength(file.length);
    expect(bytes.equals(file)).toBe(false);
    expect(bytes.includes(Buffer.from('POUFNE-CMR-987654'))).toBe(false);
    expect(bytes.subarray(0, 5).toString()).not.toBe('%PDF-');
  });

  it('keeps the encryption parameters only in the database, never in the API', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader);

    const row = await prisma.documentVersion.findFirstOrThrow({
      where: { documentId: document.id },
    });
    expect(row.iv).toHaveLength(12);
    expect(row.authTag).toHaveLength(16);
    expect(row.encryptedDataKey).toHaveLength(60);
    expect(JSON.stringify(document)).not.toMatch(/"(storageKey|iv|authTag|encryptedDataKey)":/);
  });

  it('detects the format from the content, not from the file name or Content-Type', async () => {
    const { authHeader } = await loginAs(app, prisma);

    const document = await createDocument(app, authHeader, {
      file: pngFile(),
      filename: 'dokument.pdf',
      contentType: 'application/pdf',
    });

    expect(document.mimeType).toBe('image/png');
  });

  it.each([
    ['an executable named .pdf', exeFile(), 'wirus.pdf'],
    ['a text file', Buffer.from('to nie jest skan'), 'notatka.txt'],
  ])('rejects %s with 400 on the file field and stores nothing', async (_case, file, filename) => {
    const { authHeader } = await loginAs(app, prisma);

    const response = await uploadDocument(app, authHeader, { file, filename });

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: expect.any(String),
      details: [{ path: 'file', message: 'Dozwolone są tylko pliki JPG, PNG i PDF' }],
    });
    expect(await prisma.document.count()).toBe(0);
  });

  it('rejects a file over 10 MB with 400 on the file field', async () => {
    const { authHeader } = await loginAs(app, prisma);

    const response = await uploadDocument(app, authHeader, {
      file: pngFile(10 * 1024 * 1024 + 1),
      filename: 'duzy.png',
      contentType: 'image/png',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { path: 'file', message: 'Plik jest za duży (maksymalnie 10 MB)' },
    ]);
    expect(await prisma.document.count()).toBe(0);
  });

  it('accepts a file of exactly 10 MB', async () => {
    const { authHeader } = await loginAs(app, prisma);

    const response = await uploadDocument(app, authHeader, {
      file: pngFile(10 * 1024 * 1024),
      filename: 'max.png',
      contentType: 'image/png',
    });

    expect(response.status).toBe(201);
  });

  it('rejects a request without a file', async () => {
    const { authHeader } = await loginAs(app, prisma);

    const response = await request(app)
      .post('/api/documents')
      .set('Authorization', authHeader)
      .field('type', 'CMR')
      .field('title', 'Bez pliku');

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { path: 'file', message: 'Dołącz plik dokumentu' },
    ]);
  });

  it('reports invalid metadata and a bad file together', async () => {
    const { authHeader } = await loginAs(app, prisma);

    const response = await uploadDocument(app, authHeader, {
      type: 'PASZPORT',
      title: '  ',
      file: exeFile(),
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'file',
      'title',
      'type',
    ]);
  });

  it('rejects more than one file', async () => {
    const { authHeader } = await loginAs(app, prisma);

    const response = await request(app)
      .post('/api/documents')
      .set('Authorization', authHeader)
      .field('type', 'CMR')
      .field('title', 'Dwa pliki')
      .attach('file', pdfFile(), 'a.pdf')
      .attach('file', pdfFile(), 'b.pdf');

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toBe('file');
  });

  it('returns 401 without a token', async () => {
    const response = await request(app)
      .post('/api/documents')
      .field('type', 'CMR')
      .field('title', 'x')
      .attach('file', pdfFile(), 'a.pdf');

    expect(response.status).toBe(401);
  });
});

describe('POST /api/documents/:id/versions', () => {
  const ctx = useTestApp();
  const { app, prisma } = ctx;

  it('adds version 2, keeps version 1 downloadable and records the change', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const first = pdfFile('wersja 1');
    const second = jpegFile();
    const document = await createDocument(app, authHeader, { file: first });

    const response = await request(app)
      .post(`/api/documents/${document.id}/versions`)
      .set('Authorization', authHeader)
      .field('changeNote', 'Skan z pieczątką odbiorcy')
      .attach('file', second, { filename: 'skan2.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(201);
    expect(response.body.document).toMatchObject({ currentVersion: 2, mimeType: 'image/jpeg' });
    expect(response.body.document.versions.map((v: { versionNo: number }) => v.versionNo)).toEqual([
      2, 1,
    ]);
    expect(response.body.document.versions[0]).toMatchObject({
      changeNote: 'Skan z pieczątką odbiorcy',
      sha256: sha256(second),
    });
    expect(response.body.document.history[0]).toMatchObject({
      action: 'VERSION_ADDED',
      field: 'version',
      oldValue: '1',
      newValue: '2',
    });
    const v1 = await downloadFile(app, authHeader, document.id, 1);
    const v2 = await downloadFile(app, authHeader, document.id, 2);
    expect((v1.body as Buffer).equals(first)).toBe(true);
    expect((v2.body as Buffer).equals(second)).toBe(true);
  });

  it('numbers consecutive versions 2, 3, 4', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader);

    for (const expected of [2, 3, 4]) {
      const response = await request(app)
        .post(`/api/documents/${document.id}/versions`)
        .set('Authorization', authHeader)
        .attach('file', pdfFile(), 'v.pdf');
      expect(response.body.document.currentVersion).toBe(expected);
    }
  });

  it('encrypts each version with its own key', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const file = pdfFile('ten sam plik');
    const document = await createDocument(app, authHeader, { file });
    await request(app)
      .post(`/api/documents/${document.id}/versions`)
      .set('Authorization', authHeader)
      .attach('file', file, 'same.pdf');

    const [v1, v2] = await prisma.documentVersion.findMany({
      where: { documentId: document.id },
      orderBy: { versionNo: 'asc' },
    });

    expect(v1!.sha256).toBe(v2!.sha256);
    expect(Buffer.from(v1!.encryptedDataKey).equals(Buffer.from(v2!.encryptedDataKey))).toBe(false);
  });

  it('rejects an invalid file type', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader);

    const response = await request(app)
      .post(`/api/documents/${document.id}/versions`)
      .set('Authorization', authHeader)
      .attach('file', exeFile(), 'v2.pdf');

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toBe('file');
  });

  it("returns 404 for another user's document and adds nothing", async () => {
    const owner = await loginAs(app, prisma);
    const intruder = await loginAs(app, prisma);
    const document = await createDocument(app, owner.authHeader);

    const response = await request(app)
      .post(`/api/documents/${document.id}/versions`)
      .set('Authorization', intruder.authHeader)
      .attach('file', pdfFile(), 'v2.pdf');

    expect(response.status).toBe(404);
    expect(await prisma.documentVersion.count({ where: { documentId: document.id } })).toBe(1);
  });

  it('returns 409 DOCUMENT_ARCHIVED for an archived document', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader);
    await request(app)
      .patch(`/api/documents/${document.id}`)
      .set('Authorization', authHeader)
      .send({ status: 'ARCHIVED' });

    const response = await request(app)
      .post(`/api/documents/${document.id}/versions`)
      .set('Authorization', authHeader)
      .attach('file', pdfFile(), 'v2.pdf');

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('DOCUMENT_ARCHIVED');
  });
});

describe('GET /api/documents/:id/versions/:versionNo/file', () => {
  const ctx = useTestApp();
  const { app, prisma } = ctx;

  it('sends the file inline with a safe file name and no caching', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader, { title: 'CMR Łódź / Poznań' });

    const response = await downloadFile(app, authHeader, document.id, 1);

    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toMatch(
      /^inline; filename="CMR_Lodz_Poznan-v1\.pdf"; filename\*=UTF-8''/,
    );
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['etag']).toBe(`"${document.versions[0]!.sha256}"`);
  });

  it('sends the file as an attachment with ?download=1', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader);

    const response = await downloadFile(app, authHeader, document.id, 1, '?download=1');

    expect(response.headers['content-disposition']).toMatch(/^attachment;/);
  });

  it.each([['99'], ['0'], ['abc'], ['1.5']])('returns 404 for version %s', async (versionNo) => {
    const { authHeader } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader);

    const response = await downloadFile(app, authHeader, document.id, versionNo);

    expect(response.status).toBe(404);
  });

  it("returns 404 for another user's document", async () => {
    const owner = await loginAs(app, prisma);
    const intruder = await loginAs(app, prisma);
    const document = await createDocument(app, owner.authHeader);

    const response = await downloadFile(app, intruder.authHeader, document.id, 1);

    expect(response.status).toBe(404);
  });

  it('refuses to serve a file that was tampered with in storage (500, no content)', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader);
    const { storageKey, bytes } = await readStoredObject(ctx, document.id, 1);
    bytes[10] = bytes[10]! ^ 0xff;
    await overwriteStoredObject(ctx, storageKey, bytes);

    const response = await request(app)
      .get(`/api/documents/${document.id}/versions/1/file`)
      .set('Authorization', authHeader);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('FILE_INTEGRITY_ERROR');
  });
});

describe('GET /api/documents (list)', () => {
  const { app, prisma } = useTestApp();

  it("lists only the caller's documents, newest change first, with paging info", async () => {
    const jan = await loginAs(app, prisma);
    const anna = await loginAs(app, prisma);
    const first = await createDocument(app, jan.authHeader, { title: 'Pierwszy' });
    await createDocument(app, jan.authHeader, { title: 'Drugi' });
    await createDocument(app, anna.authHeader, { title: 'Cudzy' });
    await request(app)
      .patch(`/api/documents/${first.id}`)
      .set('Authorization', jan.authHeader)
      .send({ title: 'Pierwszy (poprawiony)' });

    const response = await request(app).get('/api/documents').set('Authorization', jan.authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
    expect(response.body.items.map((d: { title: string }) => d.title)).toEqual([
      'Pierwszy (poprawiony)',
      'Drugi',
    ]);
    expect(response.body.items[0]).not.toHaveProperty('versions');
  });

  it('filters by type and by status', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const cmr = await createDocument(app, authHeader, { type: 'CMR', title: 'CMR' });
    await createDocument(app, authHeader, { type: 'WZ', title: 'WZ' });
    await request(app)
      .patch(`/api/documents/${cmr.id}`)
      .set('Authorization', authHeader)
      .send({ status: 'SUBMITTED' });

    const byType = await request(app)
      .get('/api/documents?type=WZ')
      .set('Authorization', authHeader);
    const byStatus = await request(app)
      .get('/api/documents?status=SUBMITTED')
      .set('Authorization', authHeader);
    const both = await request(app)
      .get('/api/documents?type=WZ&status=SUBMITTED')
      .set('Authorization', authHeader);

    expect(byType.body.items.map((d: { title: string }) => d.title)).toEqual(['WZ']);
    expect(byStatus.body.items.map((d: { title: string }) => d.title)).toEqual(['CMR']);
    expect(both.body.items).toEqual([]);
  });

  it('searches title and number case-insensitively', async () => {
    const { authHeader } = await loginAs(app, prisma);
    await createDocument(app, authHeader, { title: 'Dostawa Łódź', number: 'A-1' });
    await createDocument(app, authHeader, { title: 'Inny', number: 'ŁDZ-777' });
    await createDocument(app, authHeader, { title: 'Berlin', number: 'B-2' });

    const response = await request(app)
      .get(`/api/documents?q=${encodeURIComponent('łód')}`)
      .set('Authorization', authHeader);
    const byNumber = await request(app)
      .get('/api/documents?q=ldz-7')
      .set('Authorization', authHeader);
    const polishNumber = await request(app)
      .get(`/api/documents?q=${encodeURIComponent('łdz-7')}`)
      .set('Authorization', authHeader);

    expect(response.body.items.map((d: { title: string }) => d.title)).toEqual(['Dostawa Łódź']);
    expect(byNumber.body.items).toEqual([]);
    expect(polishNumber.body.items.map((d: { title: string }) => d.title)).toEqual(['Inny']);
  });

  it('paginates', async () => {
    const { authHeader } = await loginAs(app, prisma);
    for (let i = 1; i <= 5; i++) await createDocument(app, authHeader, { title: `Dok ${i}` });

    const page2 = await request(app)
      .get('/api/documents?page=2&pageSize=2')
      .set('Authorization', authHeader);
    const page3 = await request(app)
      .get('/api/documents?page=3&pageSize=2')
      .set('Authorization', authHeader);

    expect(page2.body).toMatchObject({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
    expect(page2.body.items.map((d: { title: string }) => d.title)).toEqual(['Dok 3', 'Dok 2']);
    expect(page3.body.items.map((d: { title: string }) => d.title)).toEqual(['Dok 1']);
  });

  it('returns 400 for an invalid filter', async () => {
    const { authHeader } = await loginAs(app, prisma);

    const response = await request(app)
      .get('/api/documents?status=LOST&page=0')
      .set('Authorization', authHeader);

    expect(response.status).toBe(400);
    expect(response.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'page',
      'status',
    ]);
  });

  it('returns 401 without a token', async () => {
    expect((await request(app).get('/api/documents')).status).toBe(401);
  });
});

describe('GET /api/documents/:id', () => {
  const { app, prisma } = useTestApp();

  it('returns the document with versions and history', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader);

    const response = await request(app)
      .get(`/api/documents/${document.id}`)
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body.document).toEqual(document);
  });

  it.each([
    ["another user's document", 'foreign'],
    ['an unknown id', '5f0e7c7a-0000-4000-8000-000000000000'],
    ['a malformed id', 'not-a-uuid'],
  ])('returns 404 NOT_FOUND for %s', async (_case, idKind) => {
    const owner = await loginAs(app, prisma);
    const intruder = await loginAs(app, prisma);
    const document = await createDocument(app, owner.authHeader);
    const id = idKind === 'foreign' ? document.id : idKind;

    const response = await request(app)
      .get(`/api/documents/${id}`)
      .set('Authorization', intruder.authHeader);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/documents/:id', () => {
  const { app, prisma } = useTestApp();

  it('changes title and number and records each change in the history', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader, { title: 'Stary', number: 'N-1' });

    const response = await request(app)
      .patch(`/api/documents/${document.id}`)
      .set('Authorization', authHeader)
      .send({ title: 'Nowy', number: null });

    expect(response.status).toBe(200);
    expect(response.body.document).toMatchObject({ title: 'Nowy', number: null });
    expect(response.body.document.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'UPDATED',
          field: 'title',
          oldValue: 'Stary',
          newValue: 'Nowy',
        }),
        expect.objectContaining({
          action: 'UPDATED',
          field: 'number',
          oldValue: 'N-1',
          newValue: null,
        }),
      ]),
    );
    expect(response.body.document.history).toHaveLength(3);
  });

  it('changes the status along an allowed transition and records it', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader);

    const response = await request(app)
      .patch(`/api/documents/${document.id}`)
      .set('Authorization', authHeader)
      .send({ status: 'SUBMITTED' });

    expect(response.status).toBe(200);
    expect(response.body.document.status).toBe('SUBMITTED');
    expect(response.body.document.history[0]).toMatchObject({
      action: 'STATUS_CHANGED',
      field: 'status',
      oldValue: 'DRAFT',
      newValue: 'SUBMITTED',
    });
  });

  it('returns 409 INVALID_STATUS_TRANSITION for a forbidden change and keeps the status', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader);

    const response = await request(app)
      .patch(`/api/documents/${document.id}`)
      .set('Authorization', authHeader)
      .send({ status: 'ACCEPTED', title: 'Zmieniony' });

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: 'INVALID_STATUS_TRANSITION',
      message: expect.any(String),
      details: [
        { path: 'status', message: 'Nie można zmienić statusu z „Roboczy” na „Zaakceptowany”' },
      ],
    });
    const row = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(row).toMatchObject({ status: 'DRAFT', title: document.title });
  });

  it.each(['ACCEPTED', 'REJECTED'])(
    'does not let the driver decide about a submitted document himself (%s → 403)',
    async (decision) => {
      const { authHeader } = await loginAs(app, prisma);
      const document = await createDocument(app, authHeader);
      await request(app)
        .patch(`/api/documents/${document.id}`)
        .set('Authorization', authHeader)
        .send({ status: 'SUBMITTED' });

      const response = await request(app)
        .patch(`/api/documents/${document.id}`)
        .set('Authorization', authHeader)
        .send({ status: decision });

      expect(response.status).toBe(403);
      expect(response.body.error).toMatchObject({
        code: 'STATUS_CHANGE_NOT_ALLOWED',
        details: [{ path: 'status', message: 'Tę zmianę statusu wykonuje biuro' }],
      });
      const row = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
      expect(row.status).toBe('SUBMITTED');
    },
  );

  it('records who changed the status in the history', async () => {
    const { authHeader, user } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader);

    const response = await request(app)
      .patch(`/api/documents/${document.id}`)
      .set('Authorization', authHeader)
      .send({ status: 'SUBMITTED' });

    expect(response.body.document.history[0]).toMatchObject({
      comment: null,
      changedBy: { username: user.username, role: 'DRIVER' },
    });
  });

  it('does not add history entries when nothing actually changes', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader, { title: 'Tytuł' });

    const response = await request(app)
      .patch(`/api/documents/${document.id}`)
      .set('Authorization', authHeader)
      .send({ title: '  Tytuł ', status: 'DRAFT' });

    expect(response.status).toBe(200);
    expect(response.body.document.history).toHaveLength(1);
  });

  it('makes an archived document read-only (409 DOCUMENT_ARCHIVED)', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader);
    await request(app)
      .patch(`/api/documents/${document.id}`)
      .set('Authorization', authHeader)
      .send({ status: 'ARCHIVED' });

    const response = await request(app)
      .patch(`/api/documents/${document.id}`)
      .set('Authorization', authHeader)
      .send({ title: 'Po archiwizacji' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('DOCUMENT_ARCHIVED');
  });

  it('returns 400 for an empty body', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader);

    const response = await request(app)
      .patch(`/api/documents/${document.id}`)
      .set('Authorization', authHeader)
      .send({});

    expect(response.status).toBe(400);
  });

  it("returns 404 for another user's document and leaves it unchanged", async () => {
    const owner = await loginAs(app, prisma);
    const intruder = await loginAs(app, prisma);
    const document = await createDocument(app, owner.authHeader, { title: 'Mój' });

    const response = await request(app)
      .patch(`/api/documents/${document.id}`)
      .set('Authorization', intruder.authHeader)
      .send({ title: 'Przejęty', status: 'SUBMITTED' });

    expect(response.status).toBe(404);
    const row = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(row).toMatchObject({ title: 'Mój', status: 'DRAFT' });
  });
});

describe('DELETE /api/documents/:id', () => {
  const { app, prisma } = useTestApp();

  it('soft-deletes: 204, gone from list, details and download, row kept with history', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader);

    const response = await request(app)
      .delete(`/api/documents/${document.id}`)
      .set('Authorization', authHeader);

    expect(response.status).toBe(204);
    const list = await request(app).get('/api/documents').set('Authorization', authHeader);
    expect(list.body.items).toEqual([]);
    expect(list.body.total).toBe(0);
    const details = await request(app)
      .get(`/api/documents/${document.id}`)
      .set('Authorization', authHeader);
    expect(details.status).toBe(404);
    expect((await downloadFile(app, authHeader, document.id, 1)).status).toBe(404);
    const row = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
      include: { history: true },
    });
    expect(row.deletedAt).not.toBeNull();
    expect(row.history.map((h) => h.action)).toContain('DELETED');
  });

  it('returns 404 when deleting twice', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const document = await createDocument(app, authHeader);
    await request(app).delete(`/api/documents/${document.id}`).set('Authorization', authHeader);

    const again = await request(app)
      .delete(`/api/documents/${document.id}`)
      .set('Authorization', authHeader);

    expect(again.status).toBe(404);
  });

  it("returns 404 for another user's document and does not delete it", async () => {
    const owner = await loginAs(app, prisma);
    const intruder = await loginAs(app, prisma);
    const document = await createDocument(app, owner.authHeader);

    const response = await request(app)
      .delete(`/api/documents/${document.id}`)
      .set('Authorization', intruder.authHeader);

    expect(response.status).toBe(404);
    const row = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(row.deletedAt).toBeNull();
  });
});
