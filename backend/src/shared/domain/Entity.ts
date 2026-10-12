/**
 * An Entity is defined by its identity: two entities are equal when their ids
 * match, even if the rest of their state differs.
 */
export abstract class Entity<TProps extends object> {
  protected constructor(
    readonly id: string,
    protected props: TProps,
  ) {}

  equals(other?: Entity<TProps>): boolean {
    if (!other || other.constructor !== this.constructor) {
      return false;
    }
    return this.id === other.id;
  }
}
