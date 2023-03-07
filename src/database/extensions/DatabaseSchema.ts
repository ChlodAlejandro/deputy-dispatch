import { Knex as KnexOriginal } from 'knex';
import { ArrayOrNot } from '../../util/types/ArrayOrNot';

export type Writable<T> = { -readonly [P in keyof T]: T[P] };

export const revisionColumns = <const>[
	'rev_id',
	'rev_page',
	'rev_comment_id',
	'rev_actor',
	'rev_timestamp',
	'rev_minor_edit',
	'rev_deleted',
	'rev_len',
	'rev_parent_id',
	'rev_sha1'
];
export const archiveColumns = <const>[
	'ar_id',
	'ar_namespace',
	'ar_title',
	// 'ar_text',  -- removed for ease
	'ar_comment_id',
	'ar_actor',
	'ar_timestamp',
	'ar_minor_edit',
	'ar_flags',
	'ar_rev_id',
	'ar_deleted',
	'ar_len',
	'ar_page_id',
	'ar_parent_id',
	'ar_sha1'
];
export const loggingColumns = <const>[
	'log_id',
	'log_type',
	'log_action',
	'log_timestamp',
	'log_actor',
	'log_namespace',
	'log_title',
	'log_comment_id',
	'log_params',
	'log_deleted',
	'log_page'
];
export const pageColumns = <const>[
	'page_id',
	'page_namespace',
	'page_title',
	'page_is_redirect',
	'page_is_new',
	'page_random',
	'page_touched',
	'page_links_updated',
	'page_latest',
	'page_len',
	'page_content_model',
	'page_lang'
];
export const actorColumns = <const>[ 'actor_id', 'actor_user', 'actor_name' ];
export const commentColumns = <const>[
	'comment_id',
	'comment_hash',
	'comment_text',
	'comment_data'
];

type ColumnArrayToType<T extends readonly string[]> = ( Writable<T>[number] )[];

export type RevisionColumns = ColumnArrayToType<typeof revisionColumns>;
export type ArchiveColumns = ColumnArrayToType<typeof archiveColumns>;
export type LogColumns = ColumnArrayToType<typeof loggingColumns>;
export type PageColumns = ColumnArrayToType<typeof pageColumns>;
export type ActorColumns = ColumnArrayToType<typeof actorColumns>;
export type CommentColumns = ColumnArrayToType<typeof commentColumns>;

/**
 * Generalized query builder for MediaWiki tables that allows
 * joining the same table into the same query using aliases.
 *
 * @param qb The query builder. A Knex QueryBuilder object.
 * @param joinTable The table to join.
 * @param joinSource The column to join on (on the source table).
 * @param joinTarget The column to join using (on the target table).
 * @param columns The columns to select from the joined table.
 * @param joinSourceAlias The alias of the table to join from (if columns are ambiguous)
 * @param joinTableAlias The alias of the table to be joined (if columns will be ambiguous)
 * @param extraJoins Extra joining conditions. Use for cases where joining is not a simple `=`.
 *   Extra joins are applied AFTER the standard join conditions.
 * @return The fulfilled query.
 */
export function tableJoiner<
	T extends string,
	U extends string,
	V extends string,
	W extends string[],
	X extends string,
	Y extends string,
	TRecord, TResult
>(
	qb: KnexOriginal.QueryBuilder<TRecord, TResult>,
	joinTable: T,
	joinSource: ArrayOrNot<U>,
	joinTarget: ArrayOrNot<V>,
	columns: W,
	joinSourceAlias?: X,
	joinTableAlias?: Y,
	extraJoins: (
		qb: KnexOriginal.JoinClause,
		src: ( str: U ) => `${X}.${U}`,
		trg: ( str: V ) => `${Y}.${V}`,
	) => KnexOriginal.JoinClause = ( clause ) => clause
): KnexOriginal.QueryBuilder<TRecord, TResult> {
	let finalColumns: string[];
	if ( columns ) {
		if ( columns.every( v => / as /i.test( v ) ) ) {
			// Alias mapping! No need to manually map.
			finalColumns = columns
				// Automatically add table alias if not included.
				.map( v => joinTableAlias + '.' + v.replace(
					new RegExp( '^`?' + joinTableAlias + '`?\\.' ),
					''
				) );
		} else if ( joinTableAlias ) {
			// No alias mappings but using a table alias! Add the mappings.
			finalColumns = columns
				.map( v => `${ joinTableAlias }.${ v } as ${joinTableAlias}_${ v }` );
		} else {
			// No alias mappings and no table alias! Raw column names usable.
			finalColumns = columns;
		}
	}

	const arrayMode = Array.isArray( joinSource ) && Array.isArray( joinTarget );
	if ( arrayMode ) {
		if ( joinSource.length !== joinTarget.length ) {
			throw new Error( 'Join source and target arrays must be the same length (1:1 pairs).' );
		}
	} else if ( Array.isArray( joinSource ) || Array.isArray( joinTarget ) ) {
		throw new Error( 'Join source and target must both be arrays or not arrays.' );
	}
	const source = ( arrayMode ? joinSource : [ joinSource ] ) as U[];
	const target = ( arrayMode ? joinTarget : [ joinTarget ] ) as V[];

	const src = ( str: U ) =>
		`${ joinSourceAlias ? joinSourceAlias + '.' : '' }${ str }` as `${X}.${U}`;
	const trg = ( str: V ) =>
		`${ joinTableAlias ? joinTableAlias + '.' : '' }${ str }` as `${Y}.${V}`;

	return qb
		.select( finalColumns )
		.leftJoin( joinTableAlias ? { [ joinTableAlias ]: joinTable } : joinTable,
			( join ) => {
				return arrayMode ? extraJoins(
					// Chain .on/.andOn for each pair.
					source.reduce( ( p, n, i ) => {
						return p[ i === 0 ? 'on' : 'andOn' ]( src( n ), trg( target[ i ] ) );
					}, join ),
					src, trg
				) : extraJoins(
					join.on( src( source[ 0 ] ), trg( target[ 0 ] ) ),
					src, trg
				);
			} );
}
