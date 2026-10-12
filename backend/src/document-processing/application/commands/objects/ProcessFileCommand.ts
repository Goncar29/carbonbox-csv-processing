export class ProcessFileCommand {
  constructor(
    readonly uploadId: string,
    /** How many times SQS has delivered this message (ApproximateReceiveCount). */
    readonly receiveCount: number,
    /** Deliveries allowed before SQS moves the message to the DLQ. */
    readonly maxReceiveCount: number,
  ) {}

  get isLastAttempt(): boolean {
    return this.receiveCount >= this.maxReceiveCount;
  }
}

export type ProcessFileOutcome = 'completed' | 'failed' | 'skipped';

export interface ProcessFileResult {
  uploadId: string;
  outcome: ProcessFileOutcome;
}
