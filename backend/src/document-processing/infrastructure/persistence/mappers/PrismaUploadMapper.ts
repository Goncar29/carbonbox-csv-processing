import { Upload as PrismaUpload } from '@prisma/client';
import { Upload } from '../../../domain/entities/Upload';

/** Translates between the Prisma row and the Upload aggregate. */
export const PrismaUploadMapper = {
  toDomain(row: PrismaUpload): Upload {
    const uploadOrError = Upload.fromSnapshot(row);
    if (uploadOrError.isLeft()) {
      // Stored data breaking domain rules is an unexpected failure, not a business error.
      throw new Error(`Corrupted upload ${row.id}: ${uploadOrError.value.message}`);
    }
    return uploadOrError.value;
  },

  toPersistence(upload: Upload): PrismaUpload {
    return {
      id: upload.id,
      fileName: upload.fileName,
      fileUrl: upload.fileUrl,
      status: upload.status,
      userId: upload.userId,
      totalRows: upload.totalRows,
      processedRows: upload.processedRows,
      failedRows: upload.failedRows,
      errorMessage: upload.errorMessage,
      createdAt: upload.createdAt,
      updatedAt: upload.updatedAt,
    };
  },
};
