import { PrismaClient } from '@prisma/client';
import { appConfig } from '../config';
import { createDocumentProcessingContainer } from '../document-processing/infrastructure/dependency-injection/DocumentProcessingModule';

/** Entry point of `npm run worker`: a separate process from the API. */
const bootstrap = async (): Promise<void> => {
  const prisma = new PrismaClient();
  const { fileProcessingWorker: worker, logger } = createDocumentProcessingContainer(appConfig, prisma).cradle;

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Stopping after the current batch');
    worker.stop();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await worker.start();
  await prisma.$disconnect();
};

bootstrap().catch((error: unknown) => {
  console.error('Worker crashed', error);
  process.exit(1);
});
