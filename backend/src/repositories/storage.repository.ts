import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

/** Reads and writes (already encrypted) objects in the documents bucket of MinIO / S3. */
export class StorageRepository {
  /**
   * @param s3 - S3 API client.
   * @param bucket - Name of the documents bucket.
   */
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  /**
   * Stores an object, overwriting any object with the same key.
   *
   * @param key - Object key.
   * @param body - Object content (ciphertext).
   * @throws The S3 client error if the upload fails.
   */
  async put(key: string, body: Buffer): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/octet-stream',
      }),
    );
  }

  /**
   * Reads a whole object into memory (files are at most 10 MB).
   *
   * @param key - Object key.
   * @returns The object content.
   * @throws The S3 client error (e.g. `NoSuchKey`) if the object cannot be read.
   */
  async get(key: string): Promise<Buffer> {
    const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await response.Body!.transformToByteArray());
  }

  /**
   * Deletes an object; deleting a missing object is not an error.
   *
   * @param key - Object key.
   * @throws The S3 client error if the request fails.
   */
  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
