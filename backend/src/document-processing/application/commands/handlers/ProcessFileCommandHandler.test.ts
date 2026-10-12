import { NotFoundError } from '../../../../shared/domain/errors/DomainError';
import { InMemoryActivityDataRepository, InMemoryFileStorage, InMemoryUploadRepository } from '../../../../test/fakes';
import { Upload } from '../../../domain/entities/Upload';
import { CsvParserService } from '../../services/CsvParserService';
import { ProcessFileCommand } from '../objects/ProcessFileCommand';
import { ProcessFileCommandHandler } from './ProcessFileCommandHandler';

const HEADER = 'category,amount,unit,date';
const MAX_RECEIVES = 3;

describe('ProcessFileCommandHandler', () => {
  let activityData: InMemoryActivityDataRepository;
  let uploads: InMemoryUploadRepository;
  let storage: InMemoryFileStorage;
  let handler: ProcessFileCommandHandler;

  beforeEach(() => {
    activityData = new InMemoryActivityDataRepository();
    uploads = new InMemoryUploadRepository(activityData);
    storage = new InMemoryFileStorage();
    handler = new ProcessFileCommandHandler(uploads, storage, new CsvParserService());
  });

  const seed = async (csv: string): Promise<Upload> => {
    const created = Upload.create({ id: Upload.nextIdentity(), fileName: 'data.csv', fileUrl: 'k/data.csv', userId: 'user-123' });
    if (created.isLeft()) throw created.value;
    await storage.save('k/data.csv', Buffer.from(csv), 'text/csv');
    await uploads.save(created.value);
    return created.value;
  };

  const command = (uploadId: string, receiveCount = 1) => new ProcessFileCommand(uploadId, receiveCount, MAX_RECEIVES);

  it('processes a valid file: rows saved and upload COMPLETED', async () => {
    const upload = await seed(`${HEADER}\nElectricity,150.5,kWh,2024-01-15\nWater,120,m3,2024-01-19\n`);

    const result = await handler.execute(command(upload.id));

    expect(result.isRight() && result.value).toEqual({ uploadId: upload.id, outcome: 'completed' });
    const saved = await uploads.findById(upload.id);
    expect(saved).toMatchObject({ status: 'COMPLETED', totalRows: 2, processedRows: 2, failedRows: 0, errorMessage: null });
    const rows = await activityData.findByUploadId(upload.id);
    expect(rows.map((r) => [r.category, r.amount, r.unit, r.date.toISOString().slice(0, 10)])).toEqual([
      ['Electricity', 150.5, 'kWh', '2024-01-15'],
      ['Water', 120, 'm3', '2024-01-19'],
    ]);
  });

  it('completes with a row error report when some rows are invalid', async () => {
    const upload = await seed(`${HEADER}\nWater,120,m3,2024-01-19\nWaste,-5,kg,2024-01-18\n,1,kg,2024-01-18\n`);

    await handler.execute(command(upload.id));

    const saved = await uploads.findById(upload.id);
    expect(saved).toMatchObject({ status: 'COMPLETED', totalRows: 3, processedRows: 1, failedRows: 2 });
    expect(saved?.errorMessage).toBe(
      'Row 3, column amount: must be a positive number (value: "-5")\n' +
        'Row 4, column category: is required (value: "")',
    );
    expect(await activityData.findByUploadId(upload.id)).toHaveLength(1);
  });

  it('completes with zero processed rows when every row is invalid', async () => {
    const upload = await seed(`${HEADER}\nWater,-1,m3,2024-01-19\n`);

    await handler.execute(command(upload.id));

    expect(await uploads.findById(upload.id)).toMatchObject({ status: 'COMPLETED', processedRows: 0, failedRows: 1 });
  });

  it('fails the upload when the file itself is invalid', async () => {
    const upload = await seed('category,unit,date\nWater,m3,2024-01-19\n');

    const result = await handler.execute(command(upload.id));

    expect(result.isRight() && result.value.outcome).toBe('failed');
    expect(await uploads.findById(upload.id)).toMatchObject({
      status: 'FAILED',
      errorMessage: 'Missing required column(s): amount. Expected header: category,amount,unit,date',
    });
    expect(activityData.records).toHaveLength(0);
  });

  describe('idempotency', () => {
    it.each([
      ['COMPLETED', `${HEADER}\nWater,1,m3,2024-01-19\n`],
      ['FAILED', 'category,unit,date\nWater,m3,2024-01-19\n'],
    ])('skips a redelivered message for a %s upload without writing', async (status, csv) => {
      const upload = await seed(csv);
      await handler.execute(command(upload.id));
      expect((await uploads.findById(upload.id))?.status).toBe(status);
      const rowsBefore = activityData.records.map((r) => r.id);
      const saveSpy = jest.spyOn(uploads, 'save');
      const resultSpy = jest.spyOn(uploads, 'saveProcessingResult');

      const result = await handler.execute(command(upload.id, 2));

      expect(result.isRight() && result.value.outcome).toBe('skipped');
      expect(saveSpy).not.toHaveBeenCalled();
      expect(resultSpy).not.toHaveBeenCalled();
      expect(activityData.records.map((r) => r.id)).toEqual(rowsBefore);
    });

    it('reprocesses an upload left PROCESSING by a crashed attempt, without duplicating rows', async () => {
      const upload = await seed(`${HEADER}\nWater,1,m3,2024-01-19\n`);
      upload.startProcessing();
      await uploads.save(upload);

      const result = await handler.execute(command(upload.id, 2));

      expect(result.isRight() && result.value.outcome).toBe('completed');
      expect(await activityData.findByUploadId(upload.id)).toHaveLength(1);
      expect((await uploads.findById(upload.id))?.status).toBe('COMPLETED');
    });
  });

  describe('unexpected failures', () => {
    it('rethrows and leaves the upload PROCESSING so SQS can retry', async () => {
      const upload = await seed(`${HEADER}\nWater,1,m3,2024-01-19\n`);
      jest.spyOn(storage, 'get').mockRejectedValueOnce(new Error('S3 unavailable'));

      await expect(handler.execute(command(upload.id, 1))).rejects.toThrow('S3 unavailable');

      expect((await uploads.findById(upload.id))?.status).toBe('PROCESSING');
    });

    it('marks the upload FAILED on the last attempt so polling ends, then rethrows for the DLQ', async () => {
      const upload = await seed(`${HEADER}\nWater,1,m3,2024-01-19\n`);
      jest.spyOn(storage, 'get').mockRejectedValueOnce(new Error('S3 unavailable'));

      await expect(handler.execute(command(upload.id, MAX_RECEIVES))).rejects.toThrow('S3 unavailable');

      expect(await uploads.findById(upload.id)).toMatchObject({
        status: 'FAILED',
        errorMessage: 'Processing failed after 3 attempts. Please upload the file again.',
      });
    });

    it('marks the upload FAILED when the result transaction fails on the last attempt', async () => {
      const upload = await seed(`${HEADER}\nWater,1,m3,2024-01-19\n`);
      jest.spyOn(uploads, 'saveProcessingResult').mockRejectedValueOnce(new Error('transaction failed'));

      await expect(handler.execute(command(upload.id, MAX_RECEIVES))).rejects.toThrow('transaction failed');

      expect(await uploads.findById(upload.id)).toMatchObject({
        status: 'FAILED',
        errorMessage: 'Processing failed after 3 attempts. Please upload the file again.',
      });
      expect(await activityData.findByUploadId(upload.id)).toHaveLength(0);
    });
  });

  describe('concurrent deliveries of the same message', () => {
    it('skips without writing when another worker completed the upload first', async () => {
      const upload = await seed(`${HEADER}\nWater,1,m3,2024-01-19\n`);
      const otherWorker = new ProcessFileCommandHandler(uploads, storage, new CsvParserService());
      const realGet = storage.get.bind(storage);
      // While this worker downloads the file, another delivery processes the same upload.
      jest.spyOn(storage, 'get').mockImplementationOnce(async (key) => {
        await otherWorker.execute(command(upload.id));
        return realGet(key);
      });

      const result = await handler.execute(command(upload.id));

      expect(result.isRight() && result.value.outcome).toBe('skipped');
      expect(await activityData.findByUploadId(upload.id)).toHaveLength(1);
      expect((await uploads.findById(upload.id))?.status).toBe('COMPLETED');
    });

    it('does not overwrite a COMPLETED upload with FAILED after a late last-attempt failure', async () => {
      const upload = await seed(`${HEADER}\nWater,1,m3,2024-01-19\n`);
      const otherWorker = new ProcessFileCommandHandler(uploads, storage, new CsvParserService());
      jest.spyOn(storage, 'get').mockImplementationOnce(async () => {
        await otherWorker.execute(command(upload.id));
        throw new Error('S3 unavailable');
      });

      await expect(handler.execute(command(upload.id, MAX_RECEIVES))).rejects.toThrow('S3 unavailable');

      expect((await uploads.findById(upload.id))?.status).toBe('COMPLETED');
      expect(await activityData.findByUploadId(upload.id)).toHaveLength(1);
    });
  });

  it('returns NotFoundError for an unknown upload', async () => {
    const result = await handler.execute(command('missing'));

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(NotFoundError);
  });
});
