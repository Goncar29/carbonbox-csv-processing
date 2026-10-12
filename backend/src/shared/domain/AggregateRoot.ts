import { Entity } from './Entity';

/**
 * An Aggregate Root is the only entry point to a cluster of domain objects.
 * - Outside code changes state only through its methods, never by assigning props.
 * - It enforces the invariants of the whole aggregate.
 * - Only aggregate roots get a repository.
 */
export abstract class AggregateRoot<TProps extends object> extends Entity<TProps> {}
