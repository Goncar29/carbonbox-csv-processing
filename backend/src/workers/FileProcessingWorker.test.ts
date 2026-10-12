import pino from 'pino';
import { ProcessFileCommandHandler } from '../document-processing/application/commands/handlers/ProcessFileCommandHandler';
import { ProcessFileCommand } from '../document-processing/application/commands/objects/ProcessFileCommand';
import { IMessageConsumer, ReceivedMessage } from '../shared/application/messaging/IMessageConsumer';
import { Either } from '../shared/domain/Either';
import { NotFoundError } from '../shared/domain/errors/DomainError';
import { FileProcessingWorker } from './FileProcessingWorker';

class FakeConsumer implements IMessageConsumer {
  deleted: ReceivedMessage[] = [];
  constructor(private batches: ReceivedMessage[][]) {}

  async receive(): Promise<ReceivedMessage[]> {
    return this.batches.shift() ?? [];
  }

  async delete(message: ReceivedMessage): Promise<void> {
    this.deleted.push(message);
  }
}

const message = (body: string, receiveCount = 1): ReceivedMessage => ({ body, receiptHandle: `rh-${body}`, receiveCount });

describe('FileProcessingWorker', () => {
  const logger = pino({ level: 'silent' });
  let execute: jest.Mock;
  let handler: ProcessFileCommandHandler;

  beforeEach(() => {
    execute = jest.fn();
    handler = { execute } as unknown as ProcessFileCommandHandler;
  });

  const worker = (consumer: IMessageConsumer) => new FileProcessingWorker(consumer, handler, logger, 3);

  it('processes a message and deletes it from the queue', async () => {
    execute.mockResolvedValue(Either.right({ uploadId: 'u1', outcome: 'completed' }));
    const consumer = new FakeConsumer([[message('{"uploadId":"u1"}', 2)]]);

    await worker(consumer).runOnce();

    expect(execute).toHaveBeenCalledWith(new ProcessFileCommand('u1', 2, 3));
    expect(consumer.deleted).toHaveLength(1);
  });

  it('deletes the message when the upload does not exist (it can never succeed)', async () => {
    execute.mockResolvedValue(Either.left(new NotFoundError('Upload u1 not found')));
    const consumer = new FakeConsumer([[message('{"uploadId":"u1"}')]]);

    await worker(consumer).runOnce();

    expect(consumer.deleted).toHaveLength(1);
  });

  it('keeps the message when processing throws, so SQS retries it', async () => {
    execute.mockRejectedValue(new Error('S3 unavailable'));
    const consumer = new FakeConsumer([[message('{"uploadId":"u1"}')]]);

    await worker(consumer).runOnce();

    expect(consumer.deleted).toHaveLength(0);
  });

  it.each(['not json', '{"other":1}', '{"uploadId":""}'])(
    'keeps an invalid message (%s) so it ends in the DLQ',
    async (body) => {
      const consumer = new FakeConsumer([[message(body)]]);

      await worker(consumer).runOnce();

      expect(execute).not.toHaveBeenCalled();
      expect(consumer.deleted).toHaveLength(0);
    },
  );

  it('keeps processing the rest of the batch after a failure', async () => {
    execute
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(Either.right({ uploadId: 'u2', outcome: 'completed' }));
    const consumer = new FakeConsumer([[message('{"uploadId":"u1"}'), message('{"uploadId":"u2"}')]]);

    await worker(consumer).runOnce();

    expect(consumer.deleted.map((m) => m.body)).toEqual(['{"uploadId":"u2"}']);
  });
});
