import knex, { Knex as KnexOriginal } from 'knex';

type Writable<T> = { -readonly [P in keyof T]: T[P] };

const revisionColumns = <const>[
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
const pageColumns = <const>[
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
const actorColumns = <const>[ 'actor_id', 'actor_user', 'actor_name' ];
const commentColumns = <const>[ 'comment_id', 'comment_hash', 'comment_text', 'comment_data' ];

type ColumnArrayToType<T extends readonly string[]> = ( Writable<T>[number] )[];
export type RevisionColumns = ColumnArrayToType<typeof revisionColumns>;
export type PageColumns = ColumnArrayToType<typeof pageColumns>;
export type ActorColumns = ColumnArrayToType<typeof actorColumns>;
export type CommentColumns = ColumnArrayToType<typeof commentColumns>;

declare module 'knex' {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Knex {
		interface QueryBuilder {
			/**
			 * Get extra revisions from a query which has a revision table.
			 *
			 * @param columns The columns to get
			 * @param revisionTableAlias The alias of the revision table.
			 *   Use this if there are more than two revision tables in the query.
			 * @param joinTableAlias The alias of the table to join.
			 *   Use this if there are more than two revision tables in the query.
			 */
			withRevisionParents: <TRecord, TResult>(
				columns?: RevisionColumns,
				revisionTableAlias?: string,
				joinTableAlias?: string
			) => KnexOriginal.QueryBuilder<TRecord, TResult>;

			/**
			 * Get the actors of a query which has a revision table.
			 *
			 * @param columns The columns to get
			 * @param revisionTableAlias The alias of the revision table.
			 *   Use this if there are more than two revision tables in the query.
			 * @param joinTableAlias The alias of the table to join.
			 *   Use this if there are more than two actor tables in the query.
			 */
			withRevisionActor: <TRecord, TResult>(
				columns?: ActorColumns,
				revisionTableAlias?: string,
				joinTableAlias?: string
			) => KnexOriginal.QueryBuilder<TRecord, TResult>;

			/**
			 * Get the comments of a query which has a revision table.
			 *
			 * @param columns The columns to get
			 * @param revisionTableAlias The alias of the revision table.
			 *   Use this if there are more than two revision tables in the query.
			 * @param joinTableAlias The alias of the table to join.
			 *   Use this if there are more than two comment tables in the query.
			 */
			withRevisionComment: <TRecord, TResult>(
				columns?: CommentColumns,
				revisionTableAlias?: string,
				joinTableAlias?: string
			) => KnexOriginal.QueryBuilder<TRecord, TResult>;

			/**
			 * Get the pages of a query which has a revision table.
			 *
			 * @param columns The columns to get
			 * @param revisionTableAlias The alias of the revision table.
			 *   Use this if there are more than two revision tables in the query.
			 * @param joinTableAlias The alias of the table to join.
			 *   Use this if there are more than two page tables in the query.
			 */
			withRevisionPage: <TRecord, TResult>(
				columns?: PageColumns,
				revisionTableAlias?: string,
				joinTableAlias?: string
			) => KnexOriginal.QueryBuilder<TRecord, TResult>;
		}
	}
}

/**
 * Extends the Knex Query Builder with additional functions for easily querying
 * revision data, such as performing user name, edit summary, etc.
 */
export default function attachRevisionQueryBuilderExtensions() {

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
	 * @return The fulfilled query.
	 */
	function get<
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
		joinSource: U,
		joinTarget: V,
		columns: W,
		joinSourceAlias?: X,
		joinTableAlias?: Y
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

		return qb
			.select( finalColumns )
			.leftJoin(
				joinTableAlias ? { [ joinTableAlias ]: joinTable } : joinTable,
				`${ joinSourceAlias ? joinSourceAlias + '.' : '' }${ joinSource }`,
				`${ joinTableAlias ? joinTableAlias + '.' : '' }${ joinTarget }`
			);
	}

	knex.QueryBuilder.extend( 'withRevisionParents', function (
		columns: RevisionColumns,
		revisionTableAlias?: string,
		joinTableAlias?: string
	) {
		return get(
			this, 'revision', 'rev_parent_id', 'rev_id',
			columns, revisionTableAlias, joinTableAlias
		);
	} );

	knex.QueryBuilder.extend( 'withRevisionActor', function (
		columns: ActorColumns = actorColumns as Writable<typeof actorColumns>,
		revisionTableAlias?: string,
		joinTableAlias?: string
	) {
		return get(
			this, 'actor_revision', 'rev_actor', 'actor_id',
			columns, revisionTableAlias, joinTableAlias
		);
	} );

	knex.QueryBuilder.extend( 'withRevisionComment', function (
		columns: CommentColumns = commentColumns as Writable<typeof commentColumns>,
		revisionTableAlias?: string,
		joinTableAlias?: string
	) {
		return get(
			this, 'comment_revision', 'rev_comment_id', 'comment_id',
			columns, revisionTableAlias, joinTableAlias
		);
	} );

	knex.QueryBuilder.extend( 'withRevisionPage', function (
		columns: PageColumns = pageColumns as Writable<typeof pageColumns>,
		revisionTableAlias?: string,
		joinTableAlias?: string
	) {
		return get(
			this, 'page', 'rev_page', 'page_id',
			columns, revisionTableAlias, joinTableAlias
		);
	} );

}
