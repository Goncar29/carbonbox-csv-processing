import { ValidationError } from '../../../shared/domain/errors/DomainError';
import { UploadStatus } from './UploadStatus';

describe('UploadStatus', () => {
  it.each(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'])('accepts %s', (value) => {
    const result = UploadStatus.create(value);

    expect(result.isRight()).toBe(true);
    if (result.isRight()) expect(result.value.value).toBe(value);
  });

  it.each(['DONE', 'pending', ''])('rejects unknown status "%s"', (value) => {
    const result = UploadStatus.create(value);

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(ValidationError);
  });

  it('allows only the PENDING -> PROCESSING -> COMPLETED | FAILED flow', () => {
    const pending = UploadStatus.pending();
    const processing = UploadStatus.processing();

    expect(pending.canTransitionTo(processing)).toBe(true);
    expect(processing.canTransitionTo(UploadStatus.completed())).toBe(true);
    expect(processing.canTransitionTo(UploadStatus.failed())).toBe(true);

    expect(pending.canTransitionTo(UploadStatus.completed())).toBe(false);
    expect(UploadStatus.completed().canTransitionTo(processing)).toBe(false);
    expect(UploadStatus.failed().canTransitionTo(processing)).toBe(false);
  });

  it('two statuses with the same value are equal', () => {
    expect(UploadStatus.pending().equals(UploadStatus.pending())).toBe(true);
    expect(UploadStatus.pending().equals(UploadStatus.failed())).toBe(false);
  });
});
