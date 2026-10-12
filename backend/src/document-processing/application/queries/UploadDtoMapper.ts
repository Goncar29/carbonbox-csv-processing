import { Upload } from '../../domain/entities/Upload';
import { UploadDetailDto } from './objects/GetUploadByIdQuery';

/** Read model exposed by the API. Internal fields (fileUrl, userId) stay hidden. */
export const toUploadDetailDto = (upload: Upload): UploadDetailDto => ({
  id: upload.id,
  status: upload.status,
  fileName: upload.fileName,
  totalRows: upload.totalRows,
  processedRows: upload.processedRows,
  failedRows: upload.failedRows,
  errorMessage: upload.errorMessage,
  createdAt: upload.createdAt,
  updatedAt: upload.updatedAt,
});
