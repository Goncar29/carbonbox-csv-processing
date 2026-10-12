import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { IMessagePublisher } from '../../../shared/application/messaging/IMessagePublisher';
import { FileUploadedMessage } from '../../application/messages/FileUploadedMessage';

/** IMessagePublisher adapter for AWS SQS (LocalStack in development). */
export class SqsMessagePublisher implements IMessagePublisher<FileUploadedMessage> {
  constructor(
    private readonly sqsClient: SQSClient,
    private readonly sqsQueueUrl: string,
  ) {}

  async publish(message: FileUploadedMessage): Promise<void> {
    await this.sqsClient.send(
      new SendMessageCommand({ QueueUrl: this.sqsQueueUrl, MessageBody: JSON.stringify(message) }),
    );
  }
}
