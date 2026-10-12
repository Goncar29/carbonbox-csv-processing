import { ActivityData } from '../entities/ActivityData';
import { Upload } from '../entities/Upload';
import { UploadStatusValue } from '../value-objects/UploadStatus';

export type StatusCounts = Record<UploadStatusValue, number>;

export interface Pagination {
  page: number;
  limit: number;
}

export interface PaginatedUploads {
  items: Upload[];
  total: number;
}

/**
 * Port defined by the domain. Infrastructure provides the implementation
 * (Prisma), so the domain never depends on the database technology.
 * Unexpected storage failures are thrown, not returned.
 */
export interface IUploadRepository {
  save(upload: Upload): Promise<void>;
  /**
   * Atomically replaces the upload's rows and saves its new state, only if the stored
   * upload is still PROCESSING. Returns false, writing nothing, when another delivery
   * of the same message already finished it (SQS delivers at least once).
   * Rows belong to the Upload aggregate, so they are written through its repository.
   */
  saveProcessingResult(upload: Upload, records: ActivityData[]): Promise<boolean>;
  /** Saves the upload only if the stored one is still PROCESSING. Returns whether it was saved. */
  saveIfStillProcessing(upload: Upload): Promise<boolean>;
  findById(id: string): Promise<Upload | null>;
  findPaginated(pagination: Pagination): Promise<PaginatedUploads>;
  countByStatus(): Promise<StatusCounts>;
}
