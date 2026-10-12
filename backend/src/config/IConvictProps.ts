export interface IConvictProps {
  env: 'development' | 'test' | 'production';
  port: number;
  host: string;
  corsOrigin: string;
  userId: string;
  maxUploadBytes: number;
  aws: {
    region: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    s3BucketName: string;
    sqsQueueUrl: string;
  };
  worker: {
    pollWaitSeconds: number;
    maxReceiveCount: number;
  };
}
