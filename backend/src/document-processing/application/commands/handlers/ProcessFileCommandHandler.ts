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
    // Persist PROCESSING right away so the frontend sees progress while polling.
    await this.uploadRepository.save(upload);

    try {
      return await this.process(upload);
    } catch (error) {
      // Not a controller: this catch turns an infrastructure failure on the last
      // SQS delivery into a domain state, so the upload never stays PROCESSING forever.
      if (command.isLastAttempt) {
        await this.failAfterRetries(upload, command.maxReceiveCount);
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
      await this.uploadRepository.save(upload);
      return Either.right({ uploadId: upload.id, outcome: 'failed' });
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

    await this.uploadRepository.saveProcessingResult(upload, records);
    return Either.right({ uploadId: upload.id, outcome: 'completed' });
  }

  private async failAfterRetries(upload: Upload, attempts: number): Promise<void> {
    const failed = upload.fail(`Processing failed after ${attempts} attempts. Please upload the file again.`);
    if (failed.isRight()) {
      // If this save also fails, the original error is still rethrown and logged by the worker.
      await this.uploadRepository.save(upload).catch(() => undefined);
    }
  }
}
