import { PrismaClient } from '@prisma/client';
import { Upload } from '../../../domain/entities/Upload';
import {
  IUploadRepository,
  PaginatedUploads,
  Pagination,
  StatusCounts,
} from '../../../domain/repositories/IUploadRepository';
import { UPLOAD_STATUSES, UploadStatusValue } from '../../../domain/value-objects/UploadStatus';
import { ActivityData } from '../../../domain/entities/ActivityData';
import { PrismaActivityDataMapper } from '../mappers/PrismaActivityDataMapper';
import { PrismaUploadMapper } from '../mappers/PrismaUploadMapper';

/** Large files insert many rows; Prisma's 5s default for interactive transactions is too tight. */
const TRANSACTION_TIMEOUT_MS = 30_000;

export class PrismaUploadRepository implements IUploadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(upload: Upload): Promise<void> {
    const data = PrismaUploadMapper.toPersistence(upload);
    await this.prisma.upload.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async saveProcessingResult(upload: Upload, records: ActivityData[]): Promise<boolean> {
    const { id, ...data } = PrismaUploadMapper.toPersistence(upload);
    // All or nothing: a crash can never leave rows saved with the upload still PROCESSING.
    return this.prisma.$transaction(
      async (tx) => {
        // Row lock: a second worker with the same message waits here until the first
        // commits, then sees a final status and writes nothing. Without the lock both
        // would delete (seeing no committed rows yet) and both would insert.
        const [locked] = await tx.$queryRaw<{ status: string }[]>`
          SELECT status FROM "Upload" WHERE id = ${id} FOR UPDATE`;
        if (locked?.status !== 'PROCESSING') return false;

        // Clears rows from a previous crashed attempt so a retry never duplicates them.
        await tx.activityData.deleteMany({ where: { uploadId: id } });
        await tx.activityData.createMany({ data: records.map(PrismaActivityDataMapper.toPersistence) });
        await tx.upload.update({ where: { id }, data });
        return true;
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
  }

  async saveIfNotFinal(upload: Upload): Promise<boolean> {
    const { id, ...data } = PrismaUploadMapper.toPersistence(upload);
    const { count } = await this.prisma.upload.updateMany({
      where: { id, status: { in: ['PENDING', 'PROCESSING'] } },
      data,
    });
    return count === 1;
  }

  async saveIfStillProcessing(upload: Upload): Promise<boolean> {
    const { id, ...data } = PrismaUploadMapper.toPersistence(upload);
    // Conditional update: atomic in Postgres, so a late write never overwrites a final status.
    const { count } = await this.prisma.upload.updateMany({ where: { id, status: 'PROCESSING' }, data });
    return count === 1;
  }

  async findById(id: string): Promise<Upload | null> {
    const row = await this.prisma.upload.findUnique({ where: { id } });
    return row ? PrismaUploadMapper.toDomain(row) : null;
  }

  async findPaginated({ page, limit }: Pagination): Promise<PaginatedUploads> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.upload.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.upload.count(),
    ]);
    return { items: rows.map(PrismaUploadMapper.toDomain), total };
  }

  async countByStatus(): Promise<StatusCounts> {
    const groups = await this.prisma.upload.groupBy({ by: ['status'], _count: { _all: true } });
    const counts = Object.fromEntries(UPLOAD_STATUSES.map((status) => [status, 0])) as StatusCounts;
    for (const group of groups) {
      if (group.status in counts) {
        counts[group.status as UploadStatusValue] = group._count._all;
      }
    }
    return counts;
  }
}
