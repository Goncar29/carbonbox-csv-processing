import { randomUUID } from 'node:crypto';
import { Either } from '../../../shared/domain/Either';
import { ValidationError } from '../../../shared/domain/errors/DomainError';
import { Entity } from '../../../shared/domain/Entity';

interface ActivityDataProps {
  uploadId: string;
  category: string;
  amount: number;
  unit: string;
  date: Date;
  createdAt: Date;
}

export interface CreateActivityDataProps {
  uploadId: string;
  category: string;
  amount: number;
  unit: string;
  date: Date;
}

export interface ActivityDataSnapshot extends CreateActivityDataProps {
  id: string;
  createdAt: Date;
}

/**
 * One validated row of an uploaded CSV. Belongs to an Upload but is persisted
 * through its own repository because rows are written in bulk by the worker.
 */
export class ActivityData extends Entity<ActivityDataProps> {
  private constructor(id: string, props: ActivityDataProps) {
    super(id, props);
  }

  static create(input: CreateActivityDataProps): Either<ValidationError, ActivityData> {
    const category = input.category.trim();
    const unit = input.unit.trim();

    if (input.uploadId.trim().length === 0) {
      return Either.left(new ValidationError('uploadId cannot be empty'));
    }
    if (category.length === 0) {
      return Either.left(new ValidationError('category cannot be empty'));
    }
    if (unit.length === 0) {
      return Either.left(new ValidationError('unit cannot be empty'));
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return Either.left(new ValidationError('amount must be a positive number'));
    }
    if (Number.isNaN(input.date.getTime())) {
      return Either.left(new ValidationError('date must be a valid date'));
    }

    return Either.right(
      new ActivityData(randomUUID(), {
        uploadId: input.uploadId,
        category,
        amount: input.amount,
        unit,
        date: input.date,
        createdAt: new Date(),
      }),
    );
  }

  /** Rebuilds a record from storage, where it was validated before being saved. */
  static fromSnapshot(snapshot: ActivityDataSnapshot): ActivityData {
    const { id, ...props } = snapshot;
    return new ActivityData(id, props);
  }

  get uploadId(): string {
    return this.props.uploadId;
  }

  get category(): string {
    return this.props.category;
  }

  get amount(): number {
    return this.props.amount;
  }

  get unit(): string {
    return this.props.unit;
  }

  get date(): Date {
    return this.props.date;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
