import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { IFileStorage } from '../../../shared/application/storage/IFileStorage';

/** IFileStorage adapter for AWS S3 (LocalStack in development). */
export class S3FileStorage implements IFileStorage {
  constructor(
    private readonly s3Client: S3Client,
    private readonly s3BucketName: string,
  ) {}

  async save(key: string, content: Buffer, contentType: string): Promise<void> {
    await this.s3Client.send(
      new PutObjectCommand({ Bucket: this.s3BucketName, Key: key, Body: content, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.s3Client.send(new GetObjectCommand({ Bucket: this.s3BucketName, Key: key }));
    if (!response.Body) {
      throw new Error(`S3 object ${key} has no body`);
    }
    return Buffer.from(await response.Body.transformToByteArray());
  }
}
