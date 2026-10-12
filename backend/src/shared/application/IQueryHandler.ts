import { Either } from '../domain/Either';

/** Answers a question without changing state (read side of CQRS). */
export interface IQueryHandler<TQuery, TResult> {
  execute(query: TQuery): Promise<Either<Error, TResult>>;
}
