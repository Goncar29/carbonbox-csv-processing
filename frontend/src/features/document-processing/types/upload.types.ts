export type UploadStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export const FINAL_STATUSES: readonly UploadStatus[] = ['COMPLETED', 'FAILED'];

export const isFinalStatus = (status: UploadStatus | undefined): boolean =>
  status !== undefined && FINAL_STATUSES.includes(status);

/** POST /uploads */
export interface CreatedUpload {
  id: string;
  status: UploadStatus;
  fileName: string;
  createdAt: string;
}

/** GET /uploads/:id and each item of GET /uploads */
export interface Upload {
  id: string;
  status: UploadStatus;
  fileName: string;
  totalRows: number | null;
  processedRows: number | null;
  failedRows: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedUploads {
  data: Upload[];
  total: number;
  page: number;
  limit: number;
}

/** GET /uploads/:id/results */
export interface ActivityData {
  category: string;
  amount: number;
  unit: string;
  /** YYYY-MM-DD */
  date: string;
}

export interface UploadResults {
  data: ActivityData[];
}

/** GET /uploads/summary */
export interface UploadsSummary {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}
