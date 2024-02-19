/**
 * Create a promise that rejects after a certain duration.
 *
 * @param duration The duration to wait for in milliseconds
 * @param message The message to reject with
 */
export default function timeoutPromise( duration: number, message: string ): Promise<void> {
	return new Promise( ( resolve, reject ) => {
		setTimeout( () => {
			reject( new Error( message ) );
		}, duration );
	} );
}
