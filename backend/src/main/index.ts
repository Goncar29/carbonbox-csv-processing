import { PrismaClient } from '@prisma/client';
import { appConfig } from '../config';
import { createDocumentProcessingContainer } from '../document-processing/infrastructure/dependency-injection/DocumentProcessingModule';
import { App } from './App';

const bootstrap = async (): Promise<void> => {
  const prisma = new PrismaClient();
  const container = createDocumentProcessingContainer(appConfig, prisma);
  const app = new App(container, appConfig).build();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down');
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: appConfig.port, host: appConfig.host });
};

bootstrap().catch((error: unknown) => {
  console.error('Failed to start the API', error);
  process.exit(1);
});
