export class GetUploadResultsQuery {
  constructor(readonly uploadId: string) {}
}

export interface ActivityDataDto {
  category: string;
  amount: number;
  unit: string;
  /** Same format as the CSV: YYYY-MM-DD. */
  date: string;
}

export interface GetUploadResultsResult {
  data: ActivityDataDto[];
}
