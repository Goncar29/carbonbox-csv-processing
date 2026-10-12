import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { IMessageConsumer, ReceivedMessage } from '../../../shared/application/messaging/IMessageConsumer';

/** IMessageConsumer adapter for AWS SQS with long polling. */
export class SqsMessageConsumer implements IMessageConsumer {
  constructor(
    private readonly sqsClient: SQSClient,
    private readonly sqsQueueUrl: string,
    private readonly pollWaitSeconds: number,
  ) {}

  async receive(): Promise<ReceivedMessage[]> {
    const response = await this.sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: this.sqsQueueUrl,
        MaxNumberOfMessages: 1,
        // Long polling: waits for a message instead of hammering the queue.
        WaitTimeSeconds: this.pollWaitSeconds,
        MessageSystemAttributeNames: ['ApproximateReceiveCount'],
      }),
    );

    return (response.Messages ?? [])
      .filter((message) => message.Body !== undefined && message.ReceiptHandle !== undefined)
      .map((message) => ({
        body: message.Body as string,
        receiptHandle: message.ReceiptHandle as string,
        receiveCount: Number(message.Attributes?.ApproximateReceiveCount ?? 1),
      }));
  }

  async delete(message: ReceivedMessage): Promise<void> {
    await this.sqsClient.send(
      new DeleteMessageCommand({ QueueUrl: this.sqsQueueUrl, ReceiptHandle: message.receiptHandle }),
    );
  }
}
