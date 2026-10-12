/**
 * Base class for expected business errors (returned as Either.left).
 * The HTTP layer maps each subclass to a status code.
 */
export abstract class DomainError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Input breaks a business rule (maps to 400). */
export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

/** Requested resource does not exist (maps to 404). */
export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

/** Operation is not allowed in the current state (maps to 409). */
export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}
