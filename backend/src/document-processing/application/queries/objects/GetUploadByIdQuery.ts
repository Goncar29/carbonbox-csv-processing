export class GetUploadByIdQuery {
  constructor(readonly id: string) {}
}

export interface UploadDetailDto {
  id: string;
  status: string;
  fileName: string;
  totalRows: number | null;
  processedRows: number | null;
  failedRows: number | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}
