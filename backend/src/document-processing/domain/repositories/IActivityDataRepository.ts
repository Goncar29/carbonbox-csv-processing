import { ActivityData } from '../entities/ActivityData';

export interface IActivityDataRepository {
  saveMany(records: ActivityData[]): Promise<void>;
  findByUploadId(uploadId: string): Promise<ActivityData[]>;
}
