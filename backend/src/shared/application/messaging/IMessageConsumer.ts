export interface ReceivedMessage {
  body: string;
  /** Token needed to delete (acknowledge) the message. */
  receiptHandle: string;
  /** Delivery number of this message, starting at 1. */
  receiveCount: number;
}

/**
 * Port: the worker receives messages and deletes them once handled.
 * A message that is not deleted becomes visible again and is retried.
 */
export interface IMessageConsumer {
  receive(): Promise<ReceivedMessage[]>;
  delete(message: ReceivedMessage): Promise<void>;
}
