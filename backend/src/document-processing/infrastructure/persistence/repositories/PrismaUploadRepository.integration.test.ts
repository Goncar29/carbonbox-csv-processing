import { PrismaClient } from '@prisma/client';
import { ActivityData } from '../../../domain/entities/ActivityData';
import { Upload } from '../../../domain/entities/Upload';
import { PrismaUploadRepository } from './PrismaUploadRepository';

/**
 * Runs against a real, disposable PostgreSQL database: row locks cannot be faked in memory.
 * Skipped unless TEST_DATABASE_URL points to a migrated database (never the main one).
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const ROWS = 500;

describeWithDatabase('PrismaUploadRepository (integration)', () => {
  let prisma: PrismaClient;
  let repository: PrismaUploadRepository;
  const createdIds: string[] = [];

  beforeAll(() => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    repository = new PrismaUploadRepository(prisma);
  });

  afterAll(async () => {
    await prisma.activityData.deleteMany({ where: { uploadId: { in: createdIds } } });
    await prisma.upload.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  /** Stores a PROCESSING upload and returns it as the worker would hold it. */
  const seedProcessingUpload = async (): Promise<Upload> => {
    const created = Upload.create({ id: Upload.nextIdentity(), fileName: 'data.csv', fileUrl: 'k/data.csv', userId: 'user-123' });
    if (created.isLeft()) throw created.value;
    const upload = created.value;
    upload.startProcessing();
    await repository.save(upload);
    createdIds.push(upload.id);
    return upload;
  };

  /** Simulates one worker that loaded the upload and finished parsing the file. */
  const completedByWorker = async (id: string): Promise<{ upload: Upload; records: ActivityData[] }> => {
    const upload = await repository.findById(id);
    if (!upload) throw new Error('upload not found');
    const records = Array.from({ length: ROWS }, (_, index) => {
      const record = ActivityData.create({ uploadId: id, category: `c${index}`, amount: 1, unit: 'kg', date: new Date('2024-01-01') });
      if (record.isLeft()) throw record.value;
      return record.value;
    });
    upload.complete({ totalRows: ROWS, processedRows: ROWS, failedRows: 0 });
    return { upload, records };
  };

  it('saves the rows only once when two workers save the same upload at the same time', async () => {
    const { id } = await seedProcessingUpload();
    const workerA = await completedByWorker(id);
    const workerB = await completedByWorker(id);

    const results = await Promise.all([
      repository.saveProcessingResult(workerA.upload, workerA.records),
      repository.saveProcessingResult(workerB.upload, workerB.records),
    ]);

    expect([...results].sort()).toEqual([false, true]);
    expect(await prisma.activityData.count({ where: { uploadId: id } })).toBe(ROWS);
    expect(await prisma.upload.findUnique({ where: { id } })).toMatchObject({ status: 'COMPLETED', processedRows: ROWS });
  });

  it('saveIfStillProcessing never overwrites an upload another worker already completed', async () => {
    const { id } = await seedProcessingUpload();
    const winner = await completedByWorker(id);
    const late = await repository.findById(id);
    await repository.saveProcessingResult(winner.upload, winner.records);

    late?.fail('Processing failed after 3 attempts. Please upload the file again.');
    const saved = late ? await repository.saveIfStillProcessing(late) : true;

    expect(saved).toBe(false);
    expect(await prisma.upload.findUnique({ where: { id } })).toMatchObject({ status: 'COMPLETED', errorMessage: null });
  });
});
