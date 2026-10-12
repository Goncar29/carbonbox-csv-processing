import { AwilixContainer } from 'awilix';
import { FastifyInstance } from 'fastify';
import { DocumentProcessingCradle } from '../../infrastructure/dependency-injection/DocumentProcessingModule';

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1 } },
} as const;

/**
 * Routes only wire URLs to controllers. JSON schemas check input *types*
 * (Fastify coerces "2" -> 2); business limits live in the query handlers.
 */
export const documentProcessingRoutes = (container: AwilixContainer<DocumentProcessingCradle>) =>
  async (app: FastifyInstance): Promise<void> => {
    const { cradle } = container;

    app.post('/uploads', cradle.createUploadController.handle);

    app.get(
      '/uploads',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: {
              page: { type: 'integer', default: 1 },
              limit: { type: 'integer', default: 10 },
            },
          },
        },
      },
      cradle.listUploadsController.handle,
    );

    // Static path: registered with higher priority than /uploads/:id by the router.
    app.get('/uploads/summary', cradle.getUploadsSummaryController.handle);

    app.get('/uploads/:id', { schema: { params: idParams } }, cradle.getUploadByIdController.handle);

    app.get('/uploads/:id/results', { schema: { params: idParams } }, cradle.getUploadResultsController.handle);
  };
