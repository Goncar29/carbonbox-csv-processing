import { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../shared/infrastructure/http/BaseController';
import { GetUploadResultsQueryHandler } from '../../application/queries/handlers/GetUploadResultsQueryHandler';
import { GetUploadResultsQuery } from '../../application/queries/objects/GetUploadResultsQuery';

type Request = FastifyRequest<{ Params: { id: string } }>;

export class GetUploadResultsController extends BaseController {
  constructor(private readonly getUploadResultsQueryHandler: GetUploadResultsQueryHandler) {
    super();
  }

  handle = async (request: Request, reply: FastifyReply): Promise<void> => {
    const result = await this.getUploadResultsQueryHandler.execute(new GetUploadResultsQuery(request.params.id));
    reply.send(this.unwrap(result));
  };
}
