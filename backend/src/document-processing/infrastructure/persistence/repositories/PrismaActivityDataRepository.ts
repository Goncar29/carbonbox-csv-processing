import { PrismaClient } from '@prisma/client';
import { ActivityData } from '../../../domain/entities/ActivityData';
import { IActivityDataRepository } from '../../../domain/repositories/IActivityDataRepository';
import { PrismaActivityDataMapper } from '../mappers/PrismaActivityDataMapper';

export class PrismaActivityDataRepository implements IActivityDataRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveMany(records: ActivityData[]): Promise<void> {
    if (records.length === 0) return;
    await this.prisma.activityData.createMany({
      data: records.map(PrismaActivityDataMapper.toPersistence),
    });
  }

  async findByUploadId(uploadId: string): Promise<ActivityData[]> {
    const rows = await this.prisma.activityData.findMany({
      where: { uploadId },
      orderBy: { date: 'asc' },
    });
    return rows.map(PrismaActivityDataMapper.toDomain);
  }
}
