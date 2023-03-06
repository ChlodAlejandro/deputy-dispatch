/**
 * Converts a database BLOB to a string.
 *
 * @param data
 * @param fallback
 * @return A string, `''` by default, if the database contained no string.
 */
export default function dbString( data: Buffer|null, fallback: string = '' ): string {
	return data ? data.toString( 'utf8' ) : ( fallback );
}
