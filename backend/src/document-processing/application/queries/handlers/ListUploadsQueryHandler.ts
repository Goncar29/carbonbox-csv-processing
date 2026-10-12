import { IQueryHandler } from '../../../../shared/application/IQueryHandler';
import { Either } from '../../../../shared/domain/Either';
import { ValidationError } from '../../../../shared/domain/errors/DomainError';
import { IUploadRepository } from '../../../domain/repositories/IUploadRepository';
import { ListUploadsQuery, ListUploadsResult } from '../objects/ListUploadsQuery';
import { toUploadDetailDto } from '../UploadDtoMapper';

const MAX_LIMIT = 100;
/** Keeps the database offset (page * limit) in a safe range: a huge page would overflow it. */
const MAX_PAGE = 1_000_000;

export class ListUploadsQueryHandler implements IQueryHandler<ListUploadsQuery, ListUploadsResult> {
  constructor(private readonly uploadRepository: IUploadRepository) {}

  async execute(query: ListUploadsQuery): Promise<Either<Error, ListUploadsResult>> {
    const { page, limit } = query;
    if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
      return Either.left(new ValidationError(`page must be an integer between 1 and ${MAX_PAGE}`));
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return Either.left(new ValidationError(`limit must be an integer between 1 and ${MAX_LIMIT}`));
    }

    const { items, total } = await this.uploadRepository.findPaginated({ page, limit });
    return Either.right({ data: items.map(toUploadDetailDto), total, page, limit });
  }
}
