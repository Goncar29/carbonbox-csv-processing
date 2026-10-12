import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ConflictError, DomainError, NotFoundError, ValidationError } from '../../domain/errors/DomainError';

const statusByDomainError = (error: DomainError): number => {
  if (error instanceof ValidationError) return 400;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ConflictError) return 409;
  return 400;
};

/**
 * Single place that turns errors into HTTP responses:
 * - Domain errors (returned as Either.left and thrown by controllers) -> 4xx.
 * - Framework client errors (bad multipart, file too large) -> their 4xx.
 * - Anything else -> logged and hidden behind a generic 500.
 */
export const errorHandler = (error: FastifyError, request: FastifyRequest, reply: FastifyReply): void => {
  if (error instanceof DomainError) {
    const statusCode = statusByDomainError(error);
    reply.status(statusCode).send({ statusCode, error: error.name, message: error.message });
    return;
  }

  // Schema validation (e.g. page=abc) is a validation error like the domain ones: same name.
  if (error.validation) {
    reply.status(400).send({ statusCode: 400, error: ValidationError.name, message: error.message });
    return;
  }

  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
    reply
      .status(error.statusCode)
      .send({ statusCode: error.statusCode, error: error.code ?? error.name, message: error.message });
    return;
  }

  request.log.error({ err: error }, 'Unexpected error');
  reply.status(500).send({ statusCode: 500, error: 'InternalServerError', message: 'Unexpected error' });
};
