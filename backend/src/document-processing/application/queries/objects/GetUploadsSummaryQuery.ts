export class GetUploadsSummaryQuery {}

export interface UploadsSummaryResult {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}
