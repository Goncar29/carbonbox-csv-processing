import { IQueryHandler } from '../../../../shared/application/IQueryHandler';
import { Either } from '../../../../shared/domain/Either';
import { IUploadRepository } from '../../../domain/repositories/IUploadRepository';
import { GetUploadsSummaryQuery, UploadsSummaryResult } from '../objects/GetUploadsSummaryQuery';

export class GetUploadsSummaryQueryHandler implements IQueryHandler<GetUploadsSummaryQuery, UploadsSummaryResult> {
  constructor(private readonly uploadRepository: IUploadRepository) {}

  async execute(_query: GetUploadsSummaryQuery): Promise<Either<Error, UploadsSummaryResult>> {
    const counts = await this.uploadRepository.countByStatus();
    return Either.right({
      total: counts.PENDING + counts.PROCESSING + counts.COMPLETED + counts.FAILED,
      pending: counts.PENDING,
      processing: counts.PROCESSING,
      completed: counts.COMPLETED,
      failed: counts.FAILED,
    });
  }
}
