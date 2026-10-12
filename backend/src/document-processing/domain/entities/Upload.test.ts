import { ConflictError, ValidationError } from '../../../shared/domain/errors/DomainError';
import { Upload } from './Upload';

const newUpload = (): Upload => {
  const result = Upload.create({
    id: 'upload-1',
    fileName: 'data.csv',
    fileUrl: 'uploads/upload-1/data.csv',
    userId: 'user-123',
  });
  if (result.isLeft()) throw result.value;
  return result.value;
};

const processingUpload = (): Upload => {
  const upload = newUpload();
  upload.startProcessing();
  return upload;
};

describe('Upload aggregate', () => {
  describe('create', () => {
    it('starts as PENDING with no row counters', () => {
      const upload = newUpload();

      expect(upload.id).toBe('upload-1');
      expect(upload.fileName).toBe('data.csv');
      expect(upload.fileUrl).toBe('uploads/upload-1/data.csv');
      expect(upload.userId).toBe('user-123');
      expect(upload.status).toBe('PENDING');
      expect(upload.totalRows).toBeNull();
      expect(upload.processedRows).toBeNull();
      expect(upload.failedRows).toBeNull();
      expect(upload.errorMessage).toBeNull();
    });

    it('rejects an invalid file name', () => {
      const result = Upload.create({ id: 'u', fileName: 'data.txt', fileUrl: 'x', userId: 'user-123' });

      expect(result.isLeft()).toBe(true);
      expect(result.value).toBeInstanceOf(ValidationError);
    });

    it.each([
      ['id', { id: ' ', fileUrl: 'x', userId: 'user-123' }],
      ['fileUrl', { id: 'u', fileUrl: '', userId: 'user-123' }],
      ['userId', { id: 'u', fileUrl: 'x', userId: '' }],
    ])('rejects an empty %s', (_field, props) => {
      const result = Upload.create({ fileName: 'data.csv', ...props });

      expect(result.isLeft()).toBe(true);
      expect(result.value).toBeInstanceOf(ValidationError);
    });

    it('generates unique identities', () => {
      expect(Upload.nextIdentity()).not.toBe(Upload.nextIdentity());
    });
  });

  describe('fromSnapshot', () => {
    const snapshot = {
      id: 'upload-1',
      fileName: 'data.csv',
      fileUrl: 'uploads/upload-1/data.csv',
      status: 'COMPLETED',
      userId: 'user-123',
      totalRows: 3,
      processedRows: 2,
      failedRows: 1,
      errorMessage: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    };

    it('rebuilds an upload with its stored state', () => {
      const result = Upload.fromSnapshot(snapshot);

      expect(result.isRight()).toBe(true);
      if (result.isRight()) {
        expect(result.value.status).toBe('COMPLETED');
        expect(result.value.processedRows).toBe(2);
        expect(result.value.createdAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');
      }
    });

    it('rejects a corrupted status coming from storage', () => {
      const result = Upload.fromSnapshot({ ...snapshot, status: 'DONE' });

      expect(result.isLeft()).toBe(true);
      expect(result.value).toBeInstanceOf(ValidationError);
    });
  });

  describe('startProcessing', () => {
    it('moves PENDING to PROCESSING', () => {
      const upload = newUpload();

      const result = upload.startProcessing();

      expect(result.isRight()).toBe(true);
      expect(upload.status).toBe('PROCESSING');
    });

    it('rejects starting twice', () => {
      const upload = processingUpload();

      const result = upload.startProcessing();

      expect(result.isLeft()).toBe(true);
      expect(result.value).toBeInstanceOf(ConflictError);
      expect(upload.status).toBe('PROCESSING');
    });
  });

  describe('complete', () => {
    it('moves PROCESSING to COMPLETED and stores the row counters', () => {
      const upload = processingUpload();

      const result = upload.complete({ totalRows: 10, processedRows: 8, failedRows: 2 });

      expect(result.isRight()).toBe(true);
      expect(upload.status).toBe('COMPLETED');
      expect(upload.totalRows).toBe(10);
      expect(upload.processedRows).toBe(8);
      expect(upload.failedRows).toBe(2);
    });

    it('rejects completing an upload that never started processing', () => {
      const upload = newUpload();

      const result = upload.complete({ totalRows: 1, processedRows: 1, failedRows: 0 });

      expect(result.isLeft()).toBe(true);
      expect(result.value).toBeInstanceOf(ConflictError);
      expect(upload.status).toBe('PENDING');
    });

    it.each([
      ['counters do not add up', { totalRows: 10, processedRows: 5, failedRows: 2 }],
      ['negative counter', { totalRows: 0, processedRows: 1, failedRows: -1 }],
      ['decimal counter', { totalRows: 1.5, processedRows: 1.5, failedRows: 0 }],
    ])('rejects counters when %s', (_case, counters) => {
      const upload = processingUpload();

      const result = upload.complete(counters);

      expect(result.isLeft()).toBe(true);
      expect(result.value).toBeInstanceOf(ValidationError);
      expect(upload.status).toBe('PROCESSING');
    });
  });

  describe('fail', () => {
    it('moves PROCESSING to FAILED with an error message', () => {
      const upload = processingUpload();

      const result = upload.fail('Missing required column: amount');

      expect(result.isRight()).toBe(true);
      expect(upload.status).toBe('FAILED');
      expect(upload.errorMessage).toBe('Missing required column: amount');
    });

    it('rejects an empty error message', () => {
      const upload = processingUpload();

      const result = upload.fail('  ');

      expect(result.isLeft()).toBe(true);
      expect(result.value).toBeInstanceOf(ValidationError);
    });

    it('rejects failing an upload that already completed', () => {
      const upload = processingUpload();
      upload.complete({ totalRows: 1, processedRows: 1, failedRows: 0 });

      const result = upload.fail('late error');

      expect(result.isLeft()).toBe(true);
      expect(result.value).toBeInstanceOf(ConflictError);
      expect(upload.status).toBe('COMPLETED');
    });
  });
});
