import { HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3';
import type { PrismaClient } from '../lib/prisma.js';

/** Low-level connectivity probes of the backend's external dependencies. */
export class HealthRepository {
  /**
   * @param prisma - Database client to probe.
   * @param s3 - Object-storage client to probe.
   * @param bucket - Name of the bucket that must exist and be accessible.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  /**
   * Runs `SELECT 1` on PostgreSQL (opens a pooled connection if none is open).
   *
   * @returns Resolves when the database answered.
   * @throws The driver error if the database is unreachable or rejects the query.
   */
  async pingDatabase(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  /**
   * Sends `HeadBucket` for the documents bucket to MinIO.
   *
   * @returns Resolves when the bucket exists and the credentials may access it.
   * @throws The S3 client error if MinIO is unreachable, the bucket is missing
   *   or access is denied.
   */
  async pingStorage(): Promise<void> {
    await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
