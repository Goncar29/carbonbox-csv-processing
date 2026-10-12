/**
 * Either models an operation that can end in one of two outcomes:
 * - Left: an expected business error.
 * - Right: the successful result.
 *
 * Unexpected failures (database down, network errors) are NOT modelled here:
 * they are thrown and handled by the centralized HTTP error handler.
 */
export class Left<L, R> {
  constructor(readonly value: L) {}

  isLeft(): this is Left<L, R> {
    return true;
  }

  isRight(): this is Right<L, R> {
    return false;
  }
}

export class Right<L, R> {
  constructor(readonly value: R) {}

  isLeft(): this is Left<L, R> {
    return false;
  }

  isRight(): this is Right<L, R> {
    return true;
  }
}

export type Either<L, R> = Left<L, R> | Right<L, R>;

export const Either = {
  left<L, R = never>(value: L): Either<L, R> {
    return new Left<L, R>(value);
  },
  right<R, L = never>(value: R): Either<L, R> {
    return new Right<L, R>(value);
  },
};
