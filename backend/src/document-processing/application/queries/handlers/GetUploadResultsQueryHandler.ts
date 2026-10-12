import { IQueryHandler } from '../../../../shared/application/IQueryHandler';
import { Either } from '../../../../shared/domain/Either';
import { NotFoundError } from '../../../../shared/domain/errors/DomainError';
import { IActivityDataRepository } from '../../../domain/repositories/IActivityDataRepository';
import { IUploadRepository } from '../../../domain/repositories/IUploadRepository';
import { GetUploadResultsQuery, GetUploadResultsResult } from '../objects/GetUploadResultsQuery';

export class GetUploadResultsQueryHandler implements IQueryHandler<GetUploadResultsQuery, GetUploadResultsResult> {
  constructor(
    private readonly uploadRepository: IUploadRepository,
    private readonly activityDataRepository: IActivityDataRepository,
  ) {}

  async execute(query: GetUploadResultsQuery): Promise<Either<Error, GetUploadResultsResult>> {
    const upload = await this.uploadRepository.findById(query.uploadId);
    if (!upload) {
      return Either.left(new NotFoundError(`Upload ${query.uploadId} not found`));
    }

    const records = await this.activityDataRepository.findByUploadId(upload.id);
    return Either.right({
      data: records.map((record) => ({
        category: record.category,
        amount: record.amount,
        unit: record.unit,
        date: record.date.toISOString().slice(0, 10),
      })),
    });
  }
}
