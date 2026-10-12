import { Logger } from 'pino';
import { ProcessFileCommandHandler } from '../document-processing/application/commands/handlers/ProcessFileCommandHandler';
import { ProcessFileCommand } from '../document-processing/application/commands/objects/ProcessFileCommand';
import { FileUploadedMessage } from '../document-processing/application/messages/FileUploadedMessage';
import { IMessageConsumer, ReceivedMessage } from '../shared/application/messaging/IMessageConsumer';
import { NotFoundError } from '../shared/domain/errors/DomainError';

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const parseMessage = (body: string): FileUploadedMessage | null => {
  try {
    const parsed: unknown = JSON.parse(body);
    const uploadId = (parsed as Partial<FileUploadedMessage>)?.uploadId;
    return typeof uploadId === 'string' && uploadId.length > 0 ? { uploadId } : null;
  } catch {
    return null;
  }
};

/**
 * Consumes the processing queue. A message is deleted only when its work is
 * final; otherwise SQS makes it visible again (retry) and, after
 * maxReceiveCount deliveries, moves it to the Dead Letter Queue.
 */
export class FileProcessingWorker {
  private running = false;

  constructor(
    private readonly messageConsumer: IMessageConsumer,
    private readonly processFileCommandHandler: ProcessFileCommandHandler,
    private readonly logger: Logger,
    private readonly maxReceiveCount: number,
  ) {}

  /** Polls until stop() is called. Queue outages are retried with exponential backoff. */
  async start(): Promise<void> {
    this.running = true;
    let consecutiveFailures = 0;
    this.logger.info('File processing worker started');

    while (this.running) {
      try {
        await this.runOnce();
        consecutiveFailures = 0;
      } catch (error) {
        consecutiveFailures += 1;
        const delay = Math.min(BASE_BACKOFF_MS * 2 ** (consecutiveFailures - 1), MAX_BACKOFF_MS);
        this.logger.error({ err: error, retryInMs: delay }, 'Could not receive messages');
        await sleep(delay);
      }
    }
    this.logger.info('File processing worker stopped');
  }

  /** Finishes the current batch, then exits the polling loop. */
  stop(): void {
    this.running = false;
  }

  /** Receives one batch and handles each message. Throws only if receiving fails. */
  async runOnce(): Promise<void> {
    const messages = await this.messageConsumer.receive();
    for (const message of messages) {
      await this.handle(message);
    }
  }

  private async handle(message: ReceivedMessage): Promise<void> {
    const payload = parseMessage(message.body);
    if (!payload) {
      // Poison message: never deleted, so SQS moves it to the DLQ for inspection.
      this.logger.warn({ body: message.body, receiveCount: message.receiveCount }, 'Invalid message, leaving it for the DLQ');
      return;
    }

    const log = this.logger.child({ uploadId: payload.uploadId, receiveCount: message.receiveCount });
    try {
      const result = await this.processFileCommandHandler.execute(
        new ProcessFileCommand(payload.uploadId, message.receiveCount, this.maxReceiveCount),
      );
      if (result.isLeft()) {
        if (!(result.value instanceof NotFoundError)) {
          log.error({ err: result.value }, 'Upload could not be processed, leaving the message for a retry');
          return;
        }
        log.warn('Upload not found, discarding the message');
      } else {
        log.info({ outcome: result.value.outcome }, 'Message processed');
      }
      await this.messageConsumer.delete(message);
    } catch (error) {
      log.error({ err: error }, 'Processing failed, the message will be retried by SQS');
    }
  }
}
