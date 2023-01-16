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
 * @param func The function to stagger
 * @return The staggered function
 */
export default function stagger( func: ( ...args: any[] ) => any ): ( ( ...args: any[] ) => void ) {
	let running = false;
	let willRecall = false;
	const runner = async function ( ...args: any[] ) {
		await func( args );
	};
	return async function () {
		if ( running ) {
			willRecall = true;
			return;
		}
		running = true;
		await runner();
		if ( willRecall ) {
			setTimeout( runner, 0 );
			willRecall = false;
		}
	};
}
