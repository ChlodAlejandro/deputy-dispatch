/**
 * Escapes a string that may contain special characters for regular expressions.
 *
 * @param string The string to escape.
 * @return The string, escaped, ready for the RegExp constructor.
 */
export default function ( string: string ): string {
	return string.replace( /[-/\\^$*+?.()|[\]{}]/g, '\\$&' );
}
