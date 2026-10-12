import { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../shared/infrastructure/http/BaseController';
import { GetUploadsSummaryQueryHandler } from '../../application/queries/handlers/GetUploadsSummaryQueryHandler';
import { GetUploadsSummaryQuery } from '../../application/queries/objects/GetUploadsSummaryQuery';

export class GetUploadsSummaryController extends BaseController {
  constructor(private readonly getUploadsSummaryQueryHandler: GetUploadsSummaryQueryHandler) {
    super();
  }

  handle = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const result = await this.getUploadsSummaryQueryHandler.execute(new GetUploadsSummaryQuery());
    reply.send(this.unwrap(result));
  };
}
