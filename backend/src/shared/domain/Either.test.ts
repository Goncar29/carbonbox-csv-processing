import { Either } from './Either';

describe('Either', () => {
  it('left holds the error and reports isLeft', () => {
    const result: Either<Error, number> = Either.left(new Error('boom'));

    expect(result.isLeft()).toBe(true);
    expect(result.isRight()).toBe(false);
    expect(result.value).toEqual(new Error('boom'));
  });

  it('right holds the success value and reports isRight', () => {
    const result: Either<Error, number> = Either.right(42);

    expect(result.isRight()).toBe(true);
    expect(result.isLeft()).toBe(false);
    expect(result.value).toBe(42);
  });

  it('narrows the value type after checking the side', () => {
    const result: Either<Error, number> = Either.right(21);

    if (result.isRight()) {
      // Compiles only because isRight() narrows value to number.
      expect(result.value * 2).toBe(42);
    }
  });
});
