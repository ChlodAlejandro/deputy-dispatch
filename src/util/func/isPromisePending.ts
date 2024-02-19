/**
 * Check if a given promise is pending.
 *
 * This works on the assumption that `.then` calls once a Promise has been
 * fulfilled/rejected immediately runs with no yielding.
 *
 * @param promise The promise to check
 * @return Whether the promise is pending
 */
export default function isPromisePending( promise: Promise<any> ): boolean {
	let pending = true;
	promise.then( () => pending = false, () => pending = false );
	return pending;
}
