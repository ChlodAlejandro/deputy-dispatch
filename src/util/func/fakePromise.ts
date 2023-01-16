export type FakePromise<T> = {
	promise: Promise<T>,
	resolver: ( result: T ) => void,
	rejector: ( reason: any ) => void
}

/**
 * Creates a promise object with an exposed resolver and rejector. Used
 * to create promises that resolve following a staggered or delayed
 * operation.
 *
 * @return An object containing a promise, its resolver, and rejector.
 */
export default function fakePromise<T>(): FakePromise<T> {
	let res, rej;
	const promise = new Promise<T>( ( _res, _rej ) => {
		res = _res;
		rej = _rej;
	} );
	return {
		promise,
		resolver: res,
		rejector: rej
	};
}
