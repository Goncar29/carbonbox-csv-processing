import { Either } from '../domain/Either';

/** Handles an intention to change the system (write side of CQRS). */
export interface ICommandHandler<TCommand, TResult> {
  execute(command: TCommand): Promise<Either<Error, TResult>>;
}
