/**
 * Clones a regular expression.
 *
 * @param originalRegex The original regular expression.
 * @param originalRegex.source
 * @param originalRegex.flags
 * @param injectFlags Flags to be injected (optional).
 * @return A cloned regular expression.
 */
export default function (
	originalRegex: { source: string, flags: string },
	injectFlags = ''
): RegExp {
	const pattern = originalRegex.source;
	let flags = originalRegex.flags;

	for ( const flag of injectFlags.toLowerCase() ) {
		if ( !flags.includes( flag ) ) {
			flags += flag;
		}
	}

	// Return a clone with the additive flags.
	return new RegExp( pattern, flags );
}
