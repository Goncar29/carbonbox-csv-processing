import { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../shared/infrastructure/http/BaseController';
import { GetUploadByIdQueryHandler } from '../../application/queries/handlers/GetUploadByIdQueryHandler';
import { GetUploadByIdQuery } from '../../application/queries/objects/GetUploadByIdQuery';

type Request = FastifyRequest<{ Params: { id: string } }>;

export class GetUploadByIdController extends BaseController {
  constructor(private readonly getUploadByIdQueryHandler: GetUploadByIdQueryHandler) {
    super();
  }

  handle = async (request: Request, reply: FastifyReply): Promise<void> => {
    const result = await this.getUploadByIdQueryHandler.execute(new GetUploadByIdQuery(request.params.id));
    reply.send(this.unwrap(result));
  };
}
