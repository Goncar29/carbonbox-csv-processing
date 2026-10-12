import { PrismaClient } from '@prisma/client';
import { Upload } from '../../../domain/entities/Upload';
import {
  IUploadRepository,
  PaginatedUploads,
  Pagination,
} from '../../../domain/repositories/IUploadRepository';
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
}
