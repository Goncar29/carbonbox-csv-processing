import { UploadDetailDto } from './GetUploadByIdQuery';

export class ListUploadsQuery {
  constructor(
    readonly page: number,
    readonly limit: number,
  ) {}
}

export interface ListUploadsResult {
  data: UploadDetailDto[];
  total: number;
  page: number;
  limit: number;
}
