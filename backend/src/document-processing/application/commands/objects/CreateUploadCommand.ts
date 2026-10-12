export class CreateUploadCommand {
  constructor(
    readonly fileName: string,
    readonly content: Buffer,
    readonly userId: string,
  ) {}
}

export interface CreateUploadResult {
  id: string;
  status: string;
  fileName: string;
  createdAt: Date;
}
