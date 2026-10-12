import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { AwilixContainer } from 'awilix';
import Fastify, { FastifyInstance } from 'fastify';
import { IConvictProps } from '../config/IConvictProps';
import { DocumentProcessingCradle } from '../document-processing/infrastructure/dependency-injection/DocumentProcessingModule';
import { documentProcessingRoutes } from '../document-processing/presentation/routes/DocumentProcessingRoutes';
import { errorHandler } from '../shared/infrastructure/http/errorHandler';

/** Builds the HTTP application. Dependencies come in, so tests can swap them. */
export class App {
  constructor(
    private readonly container: AwilixContainer<DocumentProcessingCradle>,
    private readonly config: IConvictProps,
  ) {}

  build(): FastifyInstance {
    const app = Fastify({
      // Structured JSON logs (pino); silent in tests.
      logger: this.config.env === 'test' ? false : { level: 'info' },
    });

    app.register(cors, { origin: this.config.corsOrigin });
    app.register(multipart, { limits: { fileSize: this.config.maxUploadBytes, files: 1 } });
    app.setErrorHandler(errorHandler);

    app.get('/health', async () => ({ status: 'ok' }));
    app.register(documentProcessingRoutes(this.container), { prefix: '/api/v1' });

    return app;
  }
}
