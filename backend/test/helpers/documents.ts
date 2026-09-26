import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { Express } from 'express';
import request, { type Response } from 'supertest';
import type { DocumentDetailsDto } from '@driver-docs/shared';
import type { TestContext } from './context.js';
import { pdfFile } from '../fixtures/files.js';

/** Metadata and file of a test upload; everything has a sensible default. */
export interface UploadInput {
  file?: Buffer;
  filename?: string;
  contentType?: string;
  type?: string;
  title?: string;
  number?: string;
  changeNote?: string;
}

/**
 * Sends `POST /api/documents` as a multipart form, like the frontend will.
 *
 * @param app - Application under test.
 * @param authHeader - `Bearer <token>` of the uploading user.
 * @param input - File and fields; defaults to a PDF CMR titled "CMR Poznań – Berlin".
 * @returns The raw Supertest response (status is not checked).
 */
export function uploadDocument(
  app: Express,
  authHeader: string,
  input: UploadInput = {},
): Promise<Response> {
  const req = request(app).post('/api/documents').set('Authorization', authHeader);
  req.field('type', input.type ?? 'CMR').field('title', input.title ?? 'CMR Poznań – Berlin');
  if (input.number !== undefined) req.field('number', input.number);
  if (input.changeNote !== undefined) req.field('changeNote', input.changeNote);
  return req.attach('file', input.file ?? pdfFile(), {
    filename: input.filename ?? 'skan.pdf',
    contentType: input.contentType ?? 'application/pdf',
  });
}

/**
 * Uploads a document and asserts that it was created.
 *
 * @param app - Application under test.
 * @param authHeader - `Bearer <token>` of the owner.
 * @param input - See {@link uploadDocument}.
 * @returns The created document.
 * @throws {Error} If the response is not 201.
 */
export async function createDocument(
  app: Express,
  authHeader: string,
  input: UploadInput = {},
): Promise<DocumentDetailsDto> {
  const response = await uploadDocument(app, authHeader, input);
  if (response.status !== 201) {
    throw new Error(`createDocument failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.document as DocumentDetailsDto;
}

/**
 * Downloads a version's file and collects the body as raw bytes.
 *
 * @param app - Application under test.
 * @param authHeader - `Bearer <token>` of the requesting user.
 * @param documentId - Document id.
 * @param versionNo - Version number (or any string, to test invalid values).
 * @param query - Optional query string, e.g. `?download=1`.
 * @param basePath - Collection the document is read from: `/api/documents` (the
 *   driver's own) or `/api/office/documents` (office view of every driver's).
 * @returns The response; `response.body` is a Buffer.
 */
export function downloadFile(
  app: Express,
  authHeader: string,
  documentId: string,
  versionNo: number | string,
  query = '',
  basePath = '/api/documents',
): Promise<Response> {
  return request(app)
    .get(`${basePath}/${documentId}/versions/${versionNo}/file${query}`)
    .set('Authorization', authHeader)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
}

/**
 * Reads the stored (encrypted) object of a version directly from MinIO, bypassing the API.
 *
 * @param ctx - Test context (database and S3 client).
 * @param documentId - Document id.
 * @param versionNo - Version number.
 * @returns The storage key and the raw object bytes.
 */
export async function readStoredObject(
  ctx: Pick<TestContext, 'prisma' | 's3' | 'config'>,
  documentId: string,
  versionNo: number,
): Promise<{ storageKey: string; bytes: Buffer }> {
  const version = await ctx.prisma.documentVersion.findUniqueOrThrow({
    where: { documentId_versionNo: { documentId, versionNo } },
  });
  const object = await ctx.s3.send(
    new GetObjectCommand({ Bucket: ctx.config.s3.bucket, Key: version.storageKey }),
  );
  return {
    storageKey: version.storageKey,
    bytes: Buffer.from(await object.Body!.transformToByteArray()),
  };
}

/**
 * Overwrites a stored object in MinIO, simulating tampering with the storage.
 *
 * @param ctx - Test context.
 * @param storageKey - Object key.
 * @param bytes - New object content.
 */
export async function overwriteStoredObject(
  ctx: Pick<TestContext, 's3' | 'config'>,
  storageKey: string,
  bytes: Buffer,
): Promise<void> {
  await ctx.s3.send(
    new PutObjectCommand({ Bucket: ctx.config.s3.bucket, Key: storageKey, Body: bytes }),
  );
}
