import { IQueryHandler } from '../../../../shared/application/IQueryHandler';
import { Either } from '../../../../shared/domain/Either';
import { NotFoundError } from '../../../../shared/domain/errors/DomainError';
import { IUploadRepository } from '../../../domain/repositories/IUploadRepository';
import { GetUploadByIdQuery, UploadDetailDto } from '../objects/GetUploadByIdQuery';
import { toUploadDetailDto } from '../UploadDtoMapper';

export class GetUploadByIdQueryHandler implements IQueryHandler<GetUploadByIdQuery, UploadDetailDto> {
  constructor(private readonly uploadRepository: IUploadRepository) {}

  async execute(query: GetUploadByIdQuery): Promise<Either<Error, UploadDetailDto>> {
    const upload = await this.uploadRepository.findById(query.id);
    if (!upload) {
      return Either.left(new NotFoundError(`Upload ${query.id} not found`));
    }
    return Either.right(toUploadDetailDto(upload));
  }
}
