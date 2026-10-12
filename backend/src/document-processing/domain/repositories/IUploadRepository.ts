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
  findById(id: string): Promise<Upload | null>;
  findPaginated(pagination: Pagination): Promise<PaginatedUploads>;
  countByStatus(): Promise<StatusCounts>;
}
