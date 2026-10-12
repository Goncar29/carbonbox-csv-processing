import { ICommandHandler } from '../../../../shared/application/ICommandHandler';
import { IMessagePublisher } from '../../../../shared/application/messaging/IMessagePublisher';
import { IFileStorage } from '../../../../shared/application/storage/IFileStorage';
import { Either } from '../../../../shared/domain/Either';
import { Upload } from '../../../domain/entities/Upload';
import { IUploadRepository } from '../../../domain/repositories/IUploadRepository';
import { FileUploadedMessage } from '../../messages/FileUploadedMessage';
import { CreateUploadCommand, CreateUploadResult } from '../objects/CreateUploadCommand';

const CSV_CONTENT_TYPE = 'text/csv';

/**
 * Write side: validates the upload, stores the file, persists it as PENDING
 * and enqueues it for asynchronous processing.
 */
export class CreateUploadCommandHandler implements ICommandHandler<CreateUploadCommand, CreateUploadResult> {
  constructor(
    private readonly uploadRepository: IUploadRepository,
    private readonly fileStorage: IFileStorage,
    private readonly messagePublisher: IMessagePublisher<FileUploadedMessage>,
  ) {}

  async execute(command: CreateUploadCommand): Promise<Either<Error, CreateUploadResult>> {
    const id = Upload.nextIdentity();
    const uploadOrError = Upload.create({
      id,
      fileName: command.fileName,
      fileUrl: `uploads/${id}/${command.fileName.trim()}`,
      userId: command.userId,
    });
    if (uploadOrError.isLeft()) {
      return Either.left(uploadOrError.value);
    }
    const upload = uploadOrError.value;

    // Order matters: the record must exist before the worker can receive the message.
    // The content type is ours, never the client's: a declared text/html would be served as HTML.
    await this.fileStorage.save(upload.fileUrl, command.content, CSV_CONTENT_TYPE);
    await this.uploadRepository.save(upload);
    await this.messagePublisher.publish({ uploadId: upload.id });

    return Either.right({
      id: upload.id,
      status: upload.status,
      fileName: upload.fileName,
      createdAt: upload.createdAt,
    });
  }
}
