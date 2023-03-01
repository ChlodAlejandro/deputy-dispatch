export type PartialPartial<A, B extends keyof A> = Omit<A, B> & { [K in B]?: A[B] | undefined };
