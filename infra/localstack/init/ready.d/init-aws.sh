#!/bin/bash
# Provisions the AWS resources the system needs inside LocalStack.
# Idempotent: safe to run on every container start.
set -euo pipefail

BUCKET_NAME="carbonbox-uploads"
QUEUE_NAME="file-processing-queue"
DLQ_NAME="file-processing-dlq"
MAX_RECEIVE_COUNT=3

echo "[init-aws] Creating S3 bucket: ${BUCKET_NAME}"
awslocal s3 mb "s3://${BUCKET_NAME}" 2>/dev/null || echo "[init-aws] Bucket already exists"

echo "[init-aws] Creating dead letter queue: ${DLQ_NAME}"
DLQ_URL=$(awslocal sqs create-queue --queue-name "${DLQ_NAME}" --query QueueUrl --output text)
DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url "${DLQ_URL}" \
  --attribute-names QueueArn --query Attributes.QueueArn --output text)

echo "[init-aws] Creating main queue: ${QUEUE_NAME} (DLQ after ${MAX_RECEIVE_COUNT} receives)"
awslocal sqs create-queue --queue-name "${QUEUE_NAME}" --attributes "{
  \"VisibilityTimeout\": \"60\",
  \"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"${DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"${MAX_RECEIVE_COUNT}\\\"}\"
}" >/dev/null

echo "[init-aws] Done"
