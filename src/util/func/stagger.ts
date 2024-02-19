import Log from '../Log';

/**
 * Takes a function, and returns a new function that calls the original function
 * only if the function has finished running since the last time it was called.
 * In other words, only one version of the function will be running at any given
 * time.
 *
 * Arguments passed to the function may or may not be used. If the function ran,
 * it will be. Otherwise, it is discarded. Consider this when using this.
 *
 * Since there is no guarantee tha the function actually runs, the result is
 * always discarded.
 *
 * If a condition function is provided, the staggering function can also be set
 * to re-call itself if the condition returns true. It will continue until it
 * is no longer true.
 *
 * @param func The function to stagger
 * @param condition A function to use as the condition to run
 * @return The staggered function
 */
export default function stagger(
	func: ( ...args: any[] ) => any,
	condition?: () => boolean
): ( ( ...args: any[] ) => void ) {
	let running = false;
	let willRecall = false;
	const runner = async function ( ...args: any[] ) {
		await func( args );
	};
	const wrapper = async function () {
		if ( running ) {
			willRecall = true;
			return;
		}
		running = true;
		await runner();
		running = false;

		const willRecallCondition = condition?.() ?? false;
		if ( willRecall || willRecallCondition ) {
			willRecall = false;
			setTimeout( wrapper, 0 );
		}
	};
	return wrapper;
}
