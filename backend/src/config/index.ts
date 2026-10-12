import convict from 'convict';
import { IConvictProps } from './IConvictProps';

/**
 * Configuration schema. Every value can be overridden by an environment
 * variable, so each environment (development, test, production) only changes
 * its .env file or container variables. validate() fails fast on bad values.
 */
const config = convict<IConvictProps>({
  env: {
    doc: 'Application environment',
    format: ['development', 'test', 'production'],
    default: 'development',
    env: 'NODE_ENV',
  },
  port: { doc: 'HTTP port', format: 'port', default: 3001, env: 'PORT' },
  host: { doc: 'HTTP host', format: String, default: '0.0.0.0', env: 'HOST' },
  corsOrigin: {
    doc: 'Allowed frontend origin',
    format: String,
    default: 'http://localhost:3000',
    env: 'CORS_ORIGIN',
  },
  userId: {
    doc: 'Single user assumed by the test (no authentication)',
    format: String,
    default: 'user-123',
    env: 'DEFAULT_USER_ID',
  },
  maxUploadBytes: {
    doc: 'Maximum CSV size in bytes',
    format: 'nat',
    default: 10 * 1024 * 1024,
    env: 'MAX_UPLOAD_BYTES',
  },
  aws: {
    region: { doc: 'AWS region', format: String, default: 'us-east-1', env: 'AWS_REGION' },
    endpoint: {
      doc: 'AWS endpoint override (LocalStack); empty for real AWS',
      format: String,
      default: '',
      env: 'AWS_ENDPOINT',
    },
    accessKeyId: { doc: 'AWS access key', format: String, default: '', env: 'AWS_ACCESS_KEY_ID', sensitive: true },
    secretAccessKey: {
      doc: 'AWS secret key',
      format: String,
      default: '',
      env: 'AWS_SECRET_ACCESS_KEY',
      sensitive: true,
    },
    s3BucketName: { doc: 'Bucket for uploaded files', format: String, default: '', env: 'S3_BUCKET_NAME' },
    sqsQueueUrl: { doc: 'Queue for processing jobs', format: String, default: '', env: 'SQS_QUEUE_URL' },
  },
  worker: {
    pollWaitSeconds: {
      doc: 'SQS long polling wait time',
      format: 'nat',
      default: 10,
      env: 'WORKER_POLL_WAIT_SECONDS',
    },
    maxReceiveCount: {
      doc: 'Deliveries before SQS moves a message to the DLQ (must match the queue RedrivePolicy)',
      format: 'nat',
      default: 3,
      env: 'WORKER_MAX_RECEIVE_COUNT',
    },
  },
});

config.validate({ allowed: 'strict' });

export const appConfig: IConvictProps = config.getProperties();
