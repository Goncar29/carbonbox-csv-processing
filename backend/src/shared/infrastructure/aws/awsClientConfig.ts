import { IConvictProps } from '../../../config/IConvictProps';

/**
 * Shared AWS SDK client options. With an endpoint override (LocalStack) the
 * S3 client must use path-style URLs: http://localhost:4566/<bucket>/<key>.
 */
export const awsClientConfig = ({ aws }: IConvictProps) => ({
  region: aws.region,
  ...(aws.endpoint ? { endpoint: aws.endpoint, forcePathStyle: true } : {}),
  ...(aws.accessKeyId && aws.secretAccessKey
    ? { credentials: { accessKeyId: aws.accessKeyId, secretAccessKey: aws.secretAccessKey } }
    : {}),
});
