export class CreateUploadCommand {
  constructor(
    readonly fileName: string,
    readonly content: Buffer,
    readonly contentType: string,
    readonly userId: string,
  ) {}
}

export interface CreateUploadResult {
  id: string;
  status: string;
  fileName: string;
  createdAt: Date;
}
