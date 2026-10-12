import { Either } from '../../../shared/domain/Either';
import { ValidationError } from '../../../shared/domain/errors/DomainError';
import { ValueObject } from '../../../shared/domain/ValueObject';

const MAX_LENGTH = 255;
const CSV_EXTENSION = '.csv';

export class FileName extends ValueObject<{ value: string }> {
  private constructor(value: string) {
    super({ value });
  }

  static create(raw: string): Either<ValidationError, FileName> {
    const value = raw.trim();

    if (value.length === 0) {
      return Either.left(new ValidationError('File name cannot be empty'));
    }
    if (value.length > MAX_LENGTH) {
      return Either.left(new ValidationError(`File name cannot exceed ${MAX_LENGTH} characters`));
    }
    if (/[\\/]/.test(value)) {
      return Either.left(new ValidationError('File name cannot contain path separators'));
    }
    if (!value.toLowerCase().endsWith(CSV_EXTENSION) || value.length === CSV_EXTENSION.length) {
      return Either.left(new ValidationError('Only .csv files are allowed'));
    }
    return Either.right(new FileName(value));
  }

  get value(): string {
    return this.props.value;
  }
}
