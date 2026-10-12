/**
 * Port: the application stores and reads files by key.
 * Infrastructure decides where (S3 in this project).
 */
export interface IFileStorage {
  save(key: string, content: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}
