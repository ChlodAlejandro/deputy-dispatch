/**
 * Count the number of instances of each item in an array.
 *
 * @param arr The array to count.
 * @param forcedKeys Keys that must always be in the array at all times.
 * @return A map keyed by the items in the array, with the number of instances as the value.
 */
export default function countInstances<T extends any[], U extends string[]>(
	arr: T,
	forcedKeys?: U
): Map<T[number] & U[number], number> {
	const counts = new Map<T[number] & U[number], number>();
	for ( const item of arr ) {
		counts.set( item, ( counts.get( item ) ?? 0 ) + 1 );
	}
	if ( forcedKeys ) {
		for ( const key of forcedKeys ) {
			if ( !counts.has( key ) ) {
				counts.set( key, 0 );
			}
		}
	}
	return counts;
}
