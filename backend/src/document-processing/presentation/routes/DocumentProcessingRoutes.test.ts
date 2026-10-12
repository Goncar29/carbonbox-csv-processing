import { PrismaClient } from '@prisma/client';
import { asValue } from 'awilix';
import { FastifyInstance } from 'fastify';
import { App } from '../../../main/App';
import {
  InMemoryActivityDataRepository,
  InMemoryFileStorage,
  InMemoryMessagePublisher,
  InMemoryUploadRepository,
  multipartFile,
  testConfig,
} from '../../../test/fakes';
import { FileUploadedMessage } from '../../application/messages/FileUploadedMessage';
import { ActivityData } from '../../domain/entities/ActivityData';
import { Upload } from '../../domain/entities/Upload';
import { createDocumentProcessingContainer } from '../../infrastructure/dependency-injection/DocumentProcessingModule';

const CSV = 'category,amount,unit,date\nElectricity,150.5,kWh,2024-01-15\n';

describe('Document processing HTTP API', () => {
  let app: FastifyInstance;
  let uploads: InMemoryUploadRepository;
  let activityData: InMemoryActivityDataRepository;
  let storage: InMemoryFileStorage;
  let publisher: InMemoryMessagePublisher<FileUploadedMessage>;

  beforeEach(async () => {
    uploads = new InMemoryUploadRepository();
    activityData = new InMemoryActivityDataRepository();
    storage = new InMemoryFileStorage();
    publisher = new InMemoryMessagePublisher();

    const container = createDocumentProcessingContainer(testConfig, new PrismaClient());
    container.register({
      uploadRepository: asValue(uploads),
      activityDataRepository: asValue(activityData),
      fileStorage: asValue(storage),
      messagePublisher: asValue(publisher),
    });

    app = new App(container, testConfig).build();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const seedUpload = async (fileName: string, status?: 'PROCESSING' | 'COMPLETED' | 'FAILED'): Promise<Upload> => {
    const created = Upload.create({ id: Upload.nextIdentity(), fileName, fileUrl: `key/${fileName}`, userId: 'user-123' });
    if (created.isLeft()) throw created.value;
    const upload = created.value;
    if (status) upload.startProcessing();
    if (status === 'COMPLETED') upload.complete({ totalRows: 1, processedRows: 1, failedRows: 0 });
    if (status === 'FAILED') upload.fail('Missing required column: amount');
    await uploads.save(upload);
    return upload;
  };

  describe('POST /api/v1/uploads', () => {
    it('stores the file, creates a PENDING upload and enqueues it', async () => {
      const { payload, headers } = multipartFile('activity.csv', CSV);

      const response = await app.inject({ method: 'POST', url: '/api/v1/uploads', payload, headers });

      expect(response.statusCode).toBe(202);
      const body = response.json();
      expect(Object.keys(body).sort()).toEqual(['createdAt', 'fileName', 'id', 'status']);
      expect(body).toMatchObject({ status: 'PENDING', fileName: 'activity.csv' });

      const saved = uploads.uploads.get(body.id);
      expect(saved?.userId).toBe('user-123');
      expect(storage.files.get(saved!.fileUrl)?.content.toString()).toBe(CSV);
      expect(publisher.messages).toEqual([{ uploadId: body.id }]);
    });

    it('rejects a non .csv file without storing or enqueuing anything', async () => {
      const { payload, headers } = multipartFile('activity.xlsx', CSV);

      const response = await app.inject({ method: 'POST', url: '/api/v1/uploads', payload, headers });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        statusCode: 400,
        error: 'ValidationError',
        message: 'Only .csv files are allowed',
      });
      expect(uploads.uploads.size).toBe(0);
      expect(storage.files.size).toBe(0);
      expect(publisher.messages).toHaveLength(0);
    });

    it('rejects a request without a file', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/uploads',
        payload: '--b\r\nContent-Disposition: form-data; name="other"\r\n\r\nx\r\n--b--\r\n',
        headers: { 'content-type': 'multipart/form-data; boundary=b' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toBe('A CSV file is required in the "file" field');
    });

    it('rejects a file larger than the configured limit', async () => {
      const { payload, headers } = multipartFile('big.csv', 'x'.repeat(testConfig.maxUploadBytes + 1));

      const response = await app.inject({ method: 'POST', url: '/api/v1/uploads', payload, headers });

      expect(response.statusCode).toBe(413);
      expect(uploads.uploads.size).toBe(0);
    });
  });

  describe('GET /api/v1/uploads/:id', () => {
    it('returns the processing state of an upload', async () => {
      const upload = await seedUpload('data.csv', 'COMPLETED');

      const response = await app.inject({ method: 'GET', url: `/api/v1/uploads/${upload.id}` });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        id: upload.id,
        status: 'COMPLETED',
        fileName: 'data.csv',
        totalRows: 1,
        processedRows: 1,
        failedRows: 0,
        errorMessage: null,
        createdAt: upload.createdAt.toISOString(),
        updatedAt: upload.updatedAt.toISOString(),
      });
    });

    it('returns 404 for an unknown upload', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/uploads/missing-id' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        statusCode: 404,
        error: 'NotFoundError',
        message: 'Upload missing-id not found',
      });
    });
  });

  describe('GET /api/v1/uploads', () => {
    it('lists uploads with default pagination (page 1, limit 10)', async () => {
      await seedUpload('a.csv');

      const response = await app.inject({ method: 'GET', url: '/api/v1/uploads' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({ total: 1, page: 1, limit: 10 });
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({ fileName: 'a.csv', status: 'PENDING' });
    });

    it('applies page and limit', async () => {
      await seedUpload('a.csv');
      await seedUpload('b.csv');
      await seedUpload('c.csv');

      const response = await app.inject({ method: 'GET', url: '/api/v1/uploads?page=2&limit=2' });

      const body = response.json();
      expect(body).toMatchObject({ total: 3, page: 2, limit: 2 });
      expect(body.data).toHaveLength(1);
    });

    it.each(['page=0', 'limit=0', 'limit=101', 'page=abc'])('rejects invalid pagination: %s', async (query) => {
      const response = await app.inject({ method: 'GET', url: `/api/v1/uploads?${query}` });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/uploads/:id/results', () => {
    it('returns the processed rows with the CSV fields only', async () => {
      const upload = await seedUpload('data.csv', 'COMPLETED');
      const record = ActivityData.create({
        uploadId: upload.id,
        category: 'Electricity',
        amount: 150.5,
        unit: 'kWh',
        date: new Date('2024-01-15T00:00:00.000Z'),
      });
      if (record.isLeft()) throw record.value;
      await activityData.saveMany([record.value]);

      const response = await app.inject({ method: 'GET', url: `/api/v1/uploads/${upload.id}/results` });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: [{ category: 'Electricity', amount: 150.5, unit: 'kWh', date: '2024-01-15' }],
      });
    });

    it('returns 404 for an unknown upload', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/uploads/missing-id/results' });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/uploads/summary', () => {
    it('counts uploads by status for the dashboard', async () => {
      await seedUpload('a.csv');
      await seedUpload('b.csv', 'PROCESSING');
      await seedUpload('c.csv', 'COMPLETED');
      await seedUpload('d.csv', 'COMPLETED');
      await seedUpload('e.csv', 'FAILED');

      const response = await app.inject({ method: 'GET', url: '/api/v1/uploads/summary' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ total: 5, pending: 1, processing: 1, completed: 2, failed: 1 });
    });
  });

  describe('centralized error handler', () => {
    it('hides unexpected errors behind a generic 500', async () => {
      jest.spyOn(uploads, 'findById').mockRejectedValueOnce(new Error('connection refused to 10.0.0.5'));

      const response = await app.inject({ method: 'GET', url: '/api/v1/uploads/any-id' });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        statusCode: 500,
        error: 'InternalServerError',
        message: 'Unexpected error',
      });
    });
  });
});
