import { FastifyReply, FastifyRequest } from 'fastify';
import { ValidationError } from '../../../shared/domain/errors/DomainError';
import { BaseController } from '../../../shared/infrastructure/http/BaseController';
import { CreateUploadCommandHandler } from '../../application/commands/handlers/CreateUploadCommandHandler';
import { CreateUploadCommand } from '../../application/commands/objects/CreateUploadCommand';

const FILE_FIELD = 'file';

export class CreateUploadController extends BaseController {
  constructor(
    private readonly createUploadCommandHandler: CreateUploadCommandHandler,
    private readonly defaultUserId: string,
  ) {
    super();
  }

  handle = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const file = await request.file();
    if (!file || file.fieldname !== FILE_FIELD) {
      throw new ValidationError(`A CSV file is required in the "${FILE_FIELD}" field`);
    }
    // Throws a 413 error when the file exceeds the configured size limit.
    const content = await file.toBuffer();

    const result = await this.createUploadCommandHandler.execute(
      new CreateUploadCommand(file.filename, content, this.defaultUserId),
    );

    // 202 Accepted: the upload is registered, processing happens asynchronously.
    reply.status(202).send(this.unwrap(result));
  };
}
