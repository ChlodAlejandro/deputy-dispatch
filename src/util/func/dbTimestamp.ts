/**
 * Converts a MediaWiki DB timestamp format (`YYYYMMDDHHMMSS`) to a native Date.
 *
 * @param ts The timestamp
 * @return A Date object
 */
export default function dbTimestamp( ts: string | Buffer ): Date {
	if ( ts instanceof Buffer ) {
		ts = ts.toString( 'utf8' );
	}
	return new Date(
		ts.slice( 0, 4 ) + '-' +
		ts.slice( 4, 6 ) + '-' +
		ts.slice( 6, 8 ) + 'T' +
		ts.slice( 8, 10 ) + ':' +
		ts.slice( 10, 12 ) + ':' +
		ts.slice( 12, 14 ) + 'Z'
	);
}
