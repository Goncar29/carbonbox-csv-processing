import { S3Client } from '@aws-sdk/client-s3';
import { SQSClient } from '@aws-sdk/client-sqs';
import { PrismaClient } from '@prisma/client';
import { AwilixContainer, InjectionMode, asClass, asValue, createContainer } from 'awilix';
import pino, { Logger } from 'pino';
import { IMessageConsumer } from '../../../shared/application/messaging/IMessageConsumer';
import { FileProcessingWorker } from '../../../workers/FileProcessingWorker';
import { ProcessFileCommandHandler } from '../../application/commands/handlers/ProcessFileCommandHandler';
import { CsvParserService } from '../../application/services/CsvParserService';
import { SqsMessageConsumer } from '../messaging/SqsMessageConsumer';
import { IConvictProps } from '../../../config/IConvictProps';
import { IMessagePublisher } from '../../../shared/application/messaging/IMessagePublisher';
import { IFileStorage } from '../../../shared/application/storage/IFileStorage';
import { awsClientConfig } from '../../../shared/infrastructure/aws/awsClientConfig';
import { CreateUploadCommandHandler } from '../../application/commands/handlers/CreateUploadCommandHandler';
import { FileUploadedMessage } from '../../application/messages/FileUploadedMessage';
import { GetUploadByIdQueryHandler } from '../../application/queries/handlers/GetUploadByIdQueryHandler';
import { GetUploadResultsQueryHandler } from '../../application/queries/handlers/GetUploadResultsQueryHandler';
import { GetUploadsSummaryQueryHandler } from '../../application/queries/handlers/GetUploadsSummaryQueryHandler';
import { ListUploadsQueryHandler } from '../../application/queries/handlers/ListUploadsQueryHandler';
import { IActivityDataRepository } from '../../domain/repositories/IActivityDataRepository';
import { IUploadRepository } from '../../domain/repositories/IUploadRepository';
import { CreateUploadController } from '../../presentation/controllers/CreateUploadController';
import { GetUploadByIdController } from '../../presentation/controllers/GetUploadByIdController';
import { GetUploadResultsController } from '../../presentation/controllers/GetUploadResultsController';
import { GetUploadsSummaryController } from '../../presentation/controllers/GetUploadsSummaryController';
import { ListUploadsController } from '../../presentation/controllers/ListUploadsController';
import { SqsMessagePublisher } from '../messaging/SqsMessagePublisher';
import { PrismaActivityDataRepository } from '../persistence/repositories/PrismaActivityDataRepository';
import { PrismaUploadRepository } from '../persistence/repositories/PrismaUploadRepository';
import { S3FileStorage } from '../storage/S3FileStorage';

/** Everything the container can resolve, keyed by constructor parameter name. */
export interface DocumentProcessingCradle {
  // Configuration values
  defaultUserId: string;
  s3BucketName: string;
  sqsQueueUrl: string;
  pollWaitSeconds: number;
  maxReceiveCount: number;
  // External clients
  prisma: PrismaClient;
  s3Client: S3Client;
  sqsClient: SQSClient;
  logger: Logger;
  // Ports -> adapters
  uploadRepository: IUploadRepository;
  activityDataRepository: IActivityDataRepository;
  fileStorage: IFileStorage;
  messagePublisher: IMessagePublisher<FileUploadedMessage>;
  messageConsumer: IMessageConsumer;
  // Application
  csvParserService: CsvParserService;
  createUploadCommandHandler: CreateUploadCommandHandler;
  processFileCommandHandler: ProcessFileCommandHandler;
  getUploadByIdQueryHandler: GetUploadByIdQueryHandler;
  listUploadsQueryHandler: ListUploadsQueryHandler;
  getUploadResultsQueryHandler: GetUploadResultsQueryHandler;
  getUploadsSummaryQueryHandler: GetUploadsSummaryQueryHandler;
  // Presentation
  createUploadController: CreateUploadController;
  getUploadByIdController: GetUploadByIdController;
  listUploadsController: ListUploadsController;
  getUploadResultsController: GetUploadResultsController;
  getUploadsSummaryController: GetUploadsSummaryController;
  // Worker
  fileProcessingWorker: FileProcessingWorker;
}

/**
 * Composition root of the document-processing context.
 * CLASSIC mode injects dependencies by constructor parameter name, so classes
 * stay framework-agnostic: constructor(private readonly prisma: PrismaClient).
 */
export const createDocumentProcessingContainer = (
  config: IConvictProps,
  prisma: PrismaClient,
): AwilixContainer<DocumentProcessingCradle> => {
  const container = createContainer<DocumentProcessingCradle>({
    injectionMode: InjectionMode.CLASSIC,
    strict: true,
  });

  container.register({
    defaultUserId: asValue(config.userId),
    s3BucketName: asValue(config.aws.s3BucketName),
    sqsQueueUrl: asValue(config.aws.sqsQueueUrl),
    pollWaitSeconds: asValue(config.worker.pollWaitSeconds),
    maxReceiveCount: asValue(config.worker.maxReceiveCount),

    prisma: asValue(prisma),
    s3Client: asValue(new S3Client(awsClientConfig(config))),
    sqsClient: asValue(new SQSClient(awsClientConfig(config))),
    logger: asValue(pino({ level: config.env === 'test' ? 'silent' : 'info' })),

    uploadRepository: asClass(PrismaUploadRepository).singleton(),
    activityDataRepository: asClass(PrismaActivityDataRepository).singleton(),
    fileStorage: asClass(S3FileStorage).singleton(),
    messagePublisher: asClass(SqsMessagePublisher).singleton(),
    messageConsumer: asClass(SqsMessageConsumer).singleton(),

    csvParserService: asClass(CsvParserService).singleton(),
    createUploadCommandHandler: asClass(CreateUploadCommandHandler).singleton(),
    processFileCommandHandler: asClass(ProcessFileCommandHandler).singleton(),
    getUploadByIdQueryHandler: asClass(GetUploadByIdQueryHandler).singleton(),
    listUploadsQueryHandler: asClass(ListUploadsQueryHandler).singleton(),
    getUploadResultsQueryHandler: asClass(GetUploadResultsQueryHandler).singleton(),
    getUploadsSummaryQueryHandler: asClass(GetUploadsSummaryQueryHandler).singleton(),

    createUploadController: asClass(CreateUploadController).singleton(),
    getUploadByIdController: asClass(GetUploadByIdController).singleton(),
    listUploadsController: asClass(ListUploadsController).singleton(),
    getUploadResultsController: asClass(GetUploadResultsController).singleton(),
    getUploadsSummaryController: asClass(GetUploadsSummaryController).singleton(),

    fileProcessingWorker: asClass(FileProcessingWorker).singleton(),
  });

  return container;
};
