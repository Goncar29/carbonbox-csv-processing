import { randomUUID } from 'node:crypto';
import { AggregateRoot } from '../../../shared/domain/AggregateRoot';
import { Either } from '../../../shared/domain/Either';
import { ConflictError, ValidationError } from '../../../shared/domain/errors/DomainError';
import { FileName } from '../value-objects/FileName';
import { UploadStatus } from '../value-objects/UploadStatus';

interface UploadProps {
  fileName: FileName;
  fileUrl: string;
  status: UploadStatus;
  userId: string;
  totalRows: number | null;
  processedRows: number | null;
  failedRows: number | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUploadProps {
  id: string;
  fileName: string;
  fileUrl: string;
  userId: string;
}

/** Plain shape used to rebuild an Upload from storage (already validated data). */
export interface UploadSnapshot {
  id: string;
  fileName: string;
  fileUrl: string;
  status: string;
  userId: string;
  totalRows: number | null;
  processedRows: number | null;
  failedRows: number | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RowCounters {
  totalRows: number;
  processedRows: number;
  failedRows: number;
}

const isBlank = (value: string): boolean => value.trim().length === 0;
const isCounter = (value: number): boolean => Number.isInteger(value) && value >= 0;

/**
 * Aggregate Root of the document-processing context.
 * Status changes only through startProcessing / complete / fail, which
 * enforce the lifecycle PENDING -> PROCESSING -> COMPLETED | FAILED.
 */
export class Upload extends AggregateRoot<UploadProps> {
  private constructor(id: string, props: UploadProps) {
    super(id, props);
  }

  static nextIdentity(): string {
    return randomUUID();
  }

  static create(input: CreateUploadProps): Either<ValidationError, Upload> {
    const fileNameOrError = FileName.create(input.fileName);
    if (fileNameOrError.isLeft()) {
      return Either.left(fileNameOrError.value);
    }
    if (isBlank(input.id)) {
      return Either.left(new ValidationError('Upload id cannot be empty'));
    }
    if (isBlank(input.fileUrl)) {
      return Either.left(new ValidationError('File url cannot be empty'));
    }
    if (isBlank(input.userId)) {
      return Either.left(new ValidationError('User id cannot be empty'));
    }

    const now = new Date();
    return Either.right(
      new Upload(input.id, {
        fileName: fileNameOrError.value,
        fileUrl: input.fileUrl,
        status: UploadStatus.pending(),
        userId: input.userId,
        totalRows: null,
        processedRows: null,
        failedRows: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  /**
   * Rebuilds an Upload from persisted data. Values are re-checked through the
   * Value Objects so corrupted rows surface as errors instead of invalid state.
   */
  static fromSnapshot(snapshot: UploadSnapshot): Either<ValidationError, Upload> {
    const fileNameOrError = FileName.create(snapshot.fileName);
    if (fileNameOrError.isLeft()) {
      return Either.left(fileNameOrError.value);
    }
    const statusOrError = UploadStatus.create(snapshot.status);
    if (statusOrError.isLeft()) {
      return Either.left(statusOrError.value);
    }

    return Either.right(
      new Upload(snapshot.id, {
        fileName: fileNameOrError.value,
        fileUrl: snapshot.fileUrl,
        status: statusOrError.value,
        userId: snapshot.userId,
        totalRows: snapshot.totalRows,
        processedRows: snapshot.processedRows,
        failedRows: snapshot.failedRows,
        errorMessage: snapshot.errorMessage,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      }),
    );
  }

  startProcessing(): Either<ConflictError, void> {
    return this.transitionTo(UploadStatus.processing());
  }

  /**
   * Retry after a crashed attempt: SQS redelivers the message while the upload
   * is still PROCESSING. Kept separate from startProcessing so the lifecycle
   * table stays strict and a retry is always an explicit decision.
   */
  restartProcessing(): Either<ConflictError, void> {
    if (!this.props.status.equals(UploadStatus.processing())) {
      return Either.left(
        new ConflictError(`Cannot restart processing from ${this.props.status.value}; only PROCESSING can be retried`),
      );
    }
    this.props.updatedAt = new Date();
    return Either.right(undefined);
  }

  /**
   * Finishes processing. Rows that failed validation do not fail the upload:
   * it completes and keeps a report of the row errors in errorMessage.
   */
  complete(counters: RowCounters, rowErrorReport?: string): Either<ConflictError | ValidationError, void> {
    const { totalRows, processedRows, failedRows } = counters;
    if (![totalRows, processedRows, failedRows].every(isCounter)) {
      return Either.left(new ValidationError('Row counters must be non-negative integers'));
    }
    if (processedRows + failedRows !== totalRows) {
      return Either.left(new ValidationError('processedRows + failedRows must equal totalRows'));
    }
    const report = rowErrorReport?.trim() ?? '';
    if (failedRows > 0 && report.length === 0) {
      return Either.left(new ValidationError('A row error report is required when some rows failed'));
    }

    const transition = this.transitionTo(UploadStatus.completed());
    if (transition.isLeft()) {
      return transition;
    }
    this.props.totalRows = totalRows;
    this.props.processedRows = processedRows;
    this.props.failedRows = failedRows;
    this.props.errorMessage = report.length > 0 ? report : null;
    return Either.right(undefined);
  }

  fail(errorMessage: string): Either<ConflictError | ValidationError, void> {
    if (isBlank(errorMessage)) {
      return Either.left(new ValidationError('A failed upload requires an error message'));
    }

    const transition = this.transitionTo(UploadStatus.failed());
    if (transition.isLeft()) {
      return transition;
    }
    this.props.errorMessage = errorMessage.trim();
    return Either.right(undefined);
  }

  private transitionTo(next: UploadStatus): Either<ConflictError, void> {
    if (!this.props.status.canTransitionTo(next)) {
      return Either.left(
        new ConflictError(`Cannot change upload status from ${this.props.status.value} to ${next.value}`),
      );
    }
    this.props.status = next;
    this.props.updatedAt = new Date();
    return Either.right(undefined);
  }

  get fileName(): string {
    return this.props.fileName.value;
  }

  get fileUrl(): string {
    return this.props.fileUrl;
  }

  get status(): string {
    return this.props.status.value;
  }

  get userId(): string {
    return this.props.userId;
  }

  get totalRows(): number | null {
    return this.props.totalRows;
  }

  get processedRows(): number | null {
    return this.props.processedRows;
  }

  get failedRows(): number | null {
    return this.props.failedRows;
  }

  get errorMessage(): string | null {
    return this.props.errorMessage;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
