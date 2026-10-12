import { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../shared/infrastructure/http/BaseController';
import { ListUploadsQueryHandler } from '../../application/queries/handlers/ListUploadsQueryHandler';
import { ListUploadsQuery } from '../../application/queries/objects/ListUploadsQuery';

type Request = FastifyRequest<{ Querystring: { page: number; limit: number } }>;

export class ListUploadsController extends BaseController {
  constructor(private readonly listUploadsQueryHandler: ListUploadsQueryHandler) {
    super();
  }

  handle = async (request: Request, reply: FastifyReply): Promise<void> => {
    const { page, limit } = request.query;
    const result = await this.listUploadsQueryHandler.execute(new ListUploadsQuery(page, limit));
    reply.send(this.unwrap(result));
  };
}
