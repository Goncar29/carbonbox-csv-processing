import { ICommandHandler } from '../../../../shared/application/ICommandHandler';
import { IFileStorage } from '../../../../shared/application/storage/IFileStorage';
import { Either } from '../../../../shared/domain/Either';
import { NotFoundError } from '../../../../shared/domain/errors/DomainError';
import { ActivityData } from '../../../domain/entities/ActivityData';
import { Upload } from '../../../domain/entities/Upload';
import { IUploadRepository } from '../../../domain/repositories/IUploadRepository';
import { CsvParserService, RowError, formatRowErrors } from '../../services/CsvParserService';
import { ProcessFileCommand, ProcessFileResult } from '../objects/ProcessFileCommand';

const FINAL_STATUSES = ['COMPLETED', 'FAILED'];

/**
 * Write side of the worker. Idempotent, because SQS delivers at least once:
 * - COMPLETED / FAILED upload -> skip (duplicate message).
 * - PENDING -> start; PROCESSING -> restart (previous attempt crashed).
 * - Rows and the COMPLETED status are saved in one transaction.
 * - Final writes only apply while the stored upload is PROCESSING, so two workers
 *   receiving the same message never duplicate rows or overwrite each other.
 */
export class ProcessFileCommandHandler implements ICommandHandler<ProcessFileCommand, ProcessFileResult> {
  constructor(
    private readonly uploadRepository: IUploadRepository,
    private readonly fileStorage: IFileStorage,
    private readonly csvParserService: CsvParserService,
  ) {}

  async execute(command: ProcessFileCommand): Promise<Either<Error, ProcessFileResult>> {
    const upload = await this.uploadRepository.findById(command.uploadId);
    if (!upload) {
      return Either.left(new NotFoundError(`Upload ${command.uploadId} not found`));
    }
    if (FINAL_STATUSES.includes(upload.status)) {
      return Either.right({ uploadId: upload.id, outcome: 'skipped' });
    }

    const started = upload.status === 'PENDING' ? upload.startProcessing() : upload.restartProcessing();
    if (started.isLeft()) {
      return Either.left(started.value);
    }
    // Persist PROCESSING right away so the frontend sees progress while polling. Conditional:
    // if another delivery finished the upload since it was read, this copy is stale.
    if (!(await this.uploadRepository.saveIfNotFinal(upload))) {
      return Either.right({ uploadId: upload.id, outcome: 'skipped' });
    }

    try {
      return await this.process(upload);
    } catch (error) {
      // Not a controller: this catch turns an infrastructure failure on the last
      // SQS delivery into a domain state, so the upload never stays PROCESSING forever.
      if (command.isLastAttempt) {
        await this.failAfterRetries(upload.id, command.maxReceiveCount);
      }
      throw error; // Not deleted from the queue: SQS retries or moves it to the DLQ.
    }
  }

  private async process(upload: Upload): Promise<Either<Error, ProcessFileResult>> {
    const content = await this.fileStorage.get(upload.fileUrl);
    const parsed = this.csvParserService.parse(content);

    if (parsed.isLeft()) {
      const failed = upload.fail(parsed.value.message);
      if (failed.isLeft()) return Either.left(failed.value);
      const saved = await this.uploadRepository.saveIfStillProcessing(upload);
      return Either.right({ uploadId: upload.id, outcome: saved ? 'failed' : 'skipped' });
    }

    const { rows, errors, totalRows } = parsed.value;
    const records: ActivityData[] = [];
    const rowErrors: RowError[] = [...errors];
    let failedRows = parsed.value.failedRows;

    for (const row of rows) {
      const record = ActivityData.create({ uploadId: upload.id, ...row });
      if (record.isRight()) {
        records.push(record.value);
      } else {
        // Defense in depth: the domain rejects a row the parser accepted.
        failedRows += 1;
        rowErrors.push({ line: row.line, column: null, message: record.value.message, value: '' });
      }
    }

    const completed = upload.complete(
      { totalRows, processedRows: records.length, failedRows },
      rowErrors.length > 0 ? formatRowErrors(rowErrors.sort((a, b) => a.line - b.line)) : undefined,
    );
    if (completed.isLeft()) {
      return Either.left(completed.value);
    }

    // False when another delivery of the same message finished the upload first.
    const saved = await this.uploadRepository.saveProcessingResult(upload, records);
    return Either.right({ uploadId: upload.id, outcome: saved ? 'completed' : 'skipped' });
  }

  /**
   * Reloads the upload instead of reusing the in-memory one: by now it may already be
   * COMPLETED in memory (the failed transaction never stored it), and COMPLETED -> FAILED
   * is not a valid transition. If this save also fails, the original error is still
   * rethrown and logged by the worker.
   */
  private async failAfterRetries(uploadId: string, attempts: number): Promise<void> {
    const stored = await this.uploadRepository.findById(uploadId).catch(() => null);
    if (stored?.status !== 'PROCESSING') return; // Another delivery already finished it.
    const failed = stored.fail(`Processing failed after ${attempts} attempts. Please upload the file again.`);
    if (failed.isRight()) {
      await this.uploadRepository.saveIfStillProcessing(stored).catch(() => false);
    }
  }
}
