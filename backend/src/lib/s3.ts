import { S3Client } from '@aws-sdk/client-s3';
import type { Config } from '../config/env.js';

/**
 * Creates an S3 API client for MinIO (or any S3-compatible storage).
 *
 * Path-style addressing (`http://host:9000/bucket/key`) is required by MinIO.
 * Connection and request timeouts keep a hung storage server from blocking API
 * requests; a single attempt is made so failures surface immediately.
 *
 * @param s3 - Endpoint, region and credentials from the application config.
 * @returns A new S3Client. No network traffic happens until a command is sent.
 */
export function createS3Client(s3: Config['s3']): S3Client {
  return new S3Client({
    endpoint: s3.endpoint,
    region: s3.region,
    forcePathStyle: true,
    credentials: { accessKeyId: s3.accessKey, secretAccessKey: s3.secretKey },
    maxAttempts: 1,
    requestHandler: { connectionTimeout: 3000, requestTimeout: 10000 },
  });
}
