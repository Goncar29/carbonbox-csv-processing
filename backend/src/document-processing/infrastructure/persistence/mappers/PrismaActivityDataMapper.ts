import { ActivityData as PrismaActivityData } from '@prisma/client';
import { ActivityData } from '../../../domain/entities/ActivityData';

/** Translates between the Prisma row and the ActivityData entity. */
export const PrismaActivityDataMapper = {
  toDomain(row: PrismaActivityData): ActivityData {
    return ActivityData.fromSnapshot(row);
  },

  toPersistence(record: ActivityData): PrismaActivityData {
    return {
      id: record.id,
      uploadId: record.uploadId,
      category: record.category,
      amount: record.amount,
      unit: record.unit,
      date: record.date,
      createdAt: record.createdAt,
    };
  },
};
