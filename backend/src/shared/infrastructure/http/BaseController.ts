import { Either } from '../../domain/Either';

/**
 * Controllers only translate HTTP <-> application. A Left result is thrown so
 * the centralized error handler maps it to a status code: no try/catch here.
 */
export abstract class BaseController {
  protected unwrap<T>(result: Either<Error, T>): T {
    if (result.isLeft()) {
      throw result.value;
    }
    return result.value;
  }
}
