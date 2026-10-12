import { IConvictProps } from '../config/IConvictProps';
import { ActivityData } from '../document-processing/domain/entities/ActivityData';
import { Upload } from '../document-processing/domain/entities/Upload';
import { IActivityDataRepository } from '../document-processing/domain/repositories/IActivityDataRepository';
import {
  IUploadRepository,
  PaginatedUploads,
  Pagination,
  StatusCounts,
} from '../document-processing/domain/repositories/IUploadRepository';
import { UPLOAD_STATUSES } from '../document-processing/domain/value-objects/UploadStatus';
import { IMessagePublisher } from '../shared/application/messaging/IMessagePublisher';
import { IFileStorage } from '../shared/application/storage/IFileStorage';

export const testConfig: IConvictProps = {
  env: 'test',
  port: 0,
  host: '127.0.0.1',
  corsOrigin: 'http://localhost:3000',
  userId: 'user-123',
  maxUploadBytes: 1024,
  aws: {
    region: 'us-east-1',
    endpoint: 'http://localhost:4566',
    accessKeyId: 'test',
    secretAccessKey: 'test',
    s3BucketName: 'test-bucket',
    sqsQueueUrl: 'http://localhost:4566/000000000000/test-queue',
  },
  worker: { pollWaitSeconds: 0, maxReceiveCount: 3 },
};

/**
 * Stores copies, like a database: changing an aggregate in memory never changes
 * what is stored until it is saved. Sharing the object would hide lost writes.
 */
const copyOf = (upload: Upload): Upload => {
  const copy = Upload.fromSnapshot({
    id: upload.id,
    fileName: upload.fileName,
    fileUrl: upload.fileUrl,
    status: upload.status,
    userId: upload.userId,
    totalRows: upload.totalRows,
    processedRows: upload.processedRows,
    failedRows: upload.failedRows,
    errorMessage: upload.errorMessage,
    createdAt: upload.createdAt,
    updatedAt: upload.updatedAt,
  });
  if (copy.isLeft()) throw copy.value;
  return copy.value;
};

export class InMemoryUploadRepository implements IUploadRepository {
  readonly uploads = new Map<string, Upload>();

  async save(upload: Upload): Promise<void> {
    this.uploads.set(upload.id, copyOf(upload));
  }

  async findById(id: string): Promise<Upload | null> {
    const stored = this.uploads.get(id);
    return stored ? copyOf(stored) : null;
  }

  async findPaginated({ page, limit }: Pagination): Promise<PaginatedUploads> {
    const sorted = [...this.uploads.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return { items: sorted.slice((page - 1) * limit, page * limit), total: sorted.length };
  }

  /** Mirrors the Prisma transaction: rows and upload change together, guarded by the stored status. */
  async saveProcessingResult(upload: Upload, records: ActivityData[]): Promise<boolean> {
    if (!this.isStillProcessing(upload.id)) return false;
    this.activityData?.replaceForUpload(upload.id, records);
    this.uploads.set(upload.id, copyOf(upload));
    return true;
  }

  async saveIfNotFinal(upload: Upload): Promise<boolean> {
    const status = this.uploads.get(upload.id)?.status;
    if (status !== 'PENDING' && status !== 'PROCESSING') return false;
    this.uploads.set(upload.id, copyOf(upload));
    return true;
  }

  async saveIfStillProcessing(upload: Upload): Promise<boolean> {
    if (!this.isStillProcessing(upload.id)) return false;
    this.uploads.set(upload.id, copyOf(upload));
    return true;
  }

  private isStillProcessing(id: string): boolean {
    return this.uploads.get(id)?.status === 'PROCESSING';
  }

  constructor(private readonly activityData?: InMemoryActivityDataRepository) {}

  async countByStatus(): Promise<StatusCounts> {
    const counts = Object.fromEntries(UPLOAD_STATUSES.map((status) => [status, 0])) as StatusCounts;
    for (const upload of this.uploads.values()) {
      counts[upload.status as keyof StatusCounts] += 1;
    }
    return counts;
  }
}

export class InMemoryActivityDataRepository implements IActivityDataRepository {
  records: ActivityData[] = [];

  replaceForUpload(uploadId: string, records: ActivityData[]): void {
    this.records = [...this.records.filter((record) => record.uploadId !== uploadId), ...records];
  }

  async saveMany(records: ActivityData[]): Promise<void> {
    this.records.push(...records);
  }

  async findByUploadId(uploadId: string): Promise<ActivityData[]> {
    return this.records.filter((record) => record.uploadId === uploadId);
  }
}

export class InMemoryFileStorage implements IFileStorage {
  readonly files = new Map<string, { content: Buffer; contentType: string }>();

  async save(key: string, content: Buffer, contentType: string): Promise<void> {
    this.files.set(key, { content, contentType });
  }

  async get(key: string): Promise<Buffer> {
    const file = this.files.get(key);
    if (!file) throw new Error(`File not found: ${key}`);
    return file.content;
  }
}

export class InMemoryMessagePublisher<TMessage extends object> implements IMessagePublisher<TMessage> {
  readonly messages: TMessage[] = [];

  async publish(message: TMessage): Promise<void> {
    this.messages.push(message);
  }
}

/** Builds a multipart/form-data body with a single file field. */
export const multipartFile = (
  fileName: string,
  content: string,
  fieldName = 'file',
): { payload: Buffer; headers: Record<string, string> } => {
  const boundary = '----carbonbox-test-boundary';
  const payload = Buffer.from(
    [
      `--${boundary}`,
      `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"`,
      'Content-Type: text/csv',
      '',
      content,
      `--${boundary}--`,
      '',
    ].join('\r\n'),
  );
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
};
