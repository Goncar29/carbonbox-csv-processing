import { Either } from '../../../shared/domain/Either';
import { ValidationError } from '../../../shared/domain/errors/DomainError';
import { ValueObject } from '../../../shared/domain/ValueObject';

export const UPLOAD_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;

export type UploadStatusValue = (typeof UPLOAD_STATUSES)[number];

/** Allowed lifecycle: PENDING -> PROCESSING -> COMPLETED | FAILED. */
const ALLOWED_TRANSITIONS: Record<UploadStatusValue, readonly UploadStatusValue[]> = {
  PENDING: ['PROCESSING'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
};

const isUploadStatusValue = (value: string): value is UploadStatusValue =>
  (UPLOAD_STATUSES as readonly string[]).includes(value);

export class UploadStatus extends ValueObject<{ value: UploadStatusValue }> {
  private constructor(value: UploadStatusValue) {
    super({ value });
  }

  static create(value: string): Either<ValidationError, UploadStatus> {
    if (!isUploadStatusValue(value)) {
      return Either.left(
        new ValidationError(`Invalid upload status "${value}". Expected one of: ${UPLOAD_STATUSES.join(', ')}`),
      );
    }
    return Either.right(new UploadStatus(value));
  }

  static pending(): UploadStatus {
    return new UploadStatus('PENDING');
  }

  static processing(): UploadStatus {
    return new UploadStatus('PROCESSING');
  }

  static completed(): UploadStatus {
    return new UploadStatus('COMPLETED');
  }

  static failed(): UploadStatus {
    return new UploadStatus('FAILED');
  }

  get value(): UploadStatusValue {
    return this.props.value;
  }

  canTransitionTo(next: UploadStatus): boolean {
    return ALLOWED_TRANSITIONS[this.value].includes(next.value);
  }
}
