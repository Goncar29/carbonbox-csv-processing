/**
 * Port: the application only knows it can publish a message.
 * Infrastructure decides how (SQS in this project).
 */
export interface IMessagePublisher<TMessage extends object> {
  publish(message: TMessage): Promise<void>;
}
