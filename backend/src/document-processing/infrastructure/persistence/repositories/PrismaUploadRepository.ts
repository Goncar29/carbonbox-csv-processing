import { PrismaClient } from '@prisma/client';
import { Upload } from '../../../domain/entities/Upload';
import {
  IUploadRepository,
  PaginatedUploads,
  Pagination,
  StatusCounts,
} from '../../../domain/repositories/IUploadRepository';
import { UPLOAD_STATUSES, UploadStatusValue } from '../../../domain/value-objects/UploadStatus';
import { PrismaUploadMapper } from '../mappers/PrismaUploadMapper';

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
