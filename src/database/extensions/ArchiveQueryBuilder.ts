import knex, { Knex as KnexOriginal } from 'knex';
import {
	actorColumns,
	ActorColumns, commentColumns,
	CommentColumns,
	pageColumns,
	PageColumns,
	ArchiveColumns, tableJoiner, Writable, LogColumns, loggingColumns
} from './DatabaseSchema';

declare module 'knex' {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Knex {
		interface QueryBuilder {
			/**
			 * Join extra archived revisions from a query which has an archive table.
			 *
			 * @param columns The columns to join
			 * @param archiveTableAlias The alias of the archive table.
			 *   Use this if there are more than two archive tables in the query.
			 * @param joinTableAlias The alias of the table to join.
			 *   Use this if there are more than two archive tables in the query.
			 */
			withArchiveParents: <TRecord, TResult>(
				columns?: ArchiveColumns,
				archiveTableAlias?: string,
				joinTableAlias?: string
			) => KnexOriginal.QueryBuilder<TRecord, TResult>;

			/**
			 * Join the actors of a query which has a archive table.
			 *
			 * @param columns The columns to join
			 * @param archiveTableAlias The alias of the archive table.
			 *   Use this if there are more than two archive tables in the query.
			 * @param joinTableAlias The alias of the table to join.
			 *   Use this if there are more than two actor tables in the query.
			 */
			withArchiveActor: <TRecord, TResult>(
				columns?: ActorColumns,
				archiveTableAlias?: string,
				joinTableAlias?: string
			) => KnexOriginal.QueryBuilder<TRecord, TResult>;

			/**
			 * Join the comments of a query which has a archive table.
			 *
			 * @param columns The columns to join
			 * @param archiveTableAlias The alias of the archive table.
			 *   Use this if there are more than two archive tables in the query.
			 * @param joinTableAlias The alias of the table to join.
			 *   Use this if there are more than two comment tables in the query.
			 */
			withArchiveComment: <TRecord, TResult>(
				columns?: CommentColumns,
				archiveTableAlias?: string,
				joinTableAlias?: string
			) => KnexOriginal.QueryBuilder<TRecord, TResult>;

			/**
			 * Join the pages of a query which has a archive table.
			 *
			 * NOTE: `ar_page_id` was only introduced in MediaWiki 1.11. For wikis
			 * which predate this version, you MUST use `ar_namespace` and `ar_title`
			 * to get page information.
			 *
			 * @param columns The columns to join
			 * @param archiveTableAlias The alias of the archive table.
			 *   Use this if there are more than two archive tables in the query.
			 * @param joinTableAlias The alias of the table to join.
			 *   Use this if there are more than two page tables in the query.
			 */
			withArchivePage: <TRecord, TResult>(
				columns?: PageColumns,
				archiveTableAlias?: string,
				joinTableAlias?: string
			) => KnexOriginal.QueryBuilder<TRecord, TResult>;

			/**
			 * Join log entries possibly related to this archived revision.
			 * Note that this performs a left join, and can cause rows to be
			 * duplicated if there are multiple log entries for the same page.
			 *
			 * To accurately determine the log entry for a given archived revision,
			 * there must first be post-processing performed.
			 *
			 * @param columns The columns to join
			 * @param archiveTableAlias The alias of the archive table.
			 *   Use this if there are more than two archive tables in the query.
			 * @param joinTableAlias The alias of the table to join.
			 *   Use this if there are more than two logging tables in the query.
			 */
			withArchiveDeletion: <TRecord, TResult>(
				columns?: LogColumns,
				archiveTableAlias?: string,
				joinTableAlias?: string
			) => KnexOriginal.QueryBuilder<TRecord, TResult>;
		}
	}
}

/**
 * Extends the Knex Query Builder with additional functions for easily querying
 * archive revision data, such as performing joins with user name, edit summary, etc.
 */
export default function attachArchiveQueryBuilderExtensions() {

	knex.QueryBuilder.extend( 'withArchiveParents', function (
		columns: ArchiveColumns,
		archiveTableAlias?: string,
		joinTableAlias?: string
	) {
		return tableJoiner(
			this, 'archive', 'ar_parent_id', 'ar_id',
			columns, archiveTableAlias, joinTableAlias
		);
	} );

	knex.QueryBuilder.extend( 'withArchiveActor', function (
		columns: ActorColumns = actorColumns as Writable<typeof actorColumns>,
		archiveTableAlias?: string,
		joinTableAlias?: string
	) {
		return tableJoiner(
			this, 'actor_revision', 'ar_actor', 'actor_id',
			columns, archiveTableAlias, joinTableAlias
		);
	} );

	knex.QueryBuilder.extend( 'withArchiveComment', function (
		columns: CommentColumns = commentColumns as Writable<typeof commentColumns>,
		archiveTableAlias?: string,
		joinTableAlias?: string
	) {
		return tableJoiner(
			this, 'comment_revision', 'ar_comment_id', 'comment_id',
			columns, archiveTableAlias, joinTableAlias
		);
	} );

	knex.QueryBuilder.extend( 'withArchivePage', function (
		columns: PageColumns = pageColumns as Writable<typeof pageColumns>,
		archiveTableAlias?: string,
		joinTableAlias?: string
	) {
		return tableJoiner(
			this, 'page', 'ar_page_id', 'page_id',
			columns, archiveTableAlias, joinTableAlias
		);
	} );

	knex.QueryBuilder.extend( 'withArchiveDeletion', function (
		columns: LogColumns = loggingColumns as Writable<typeof loggingColumns>,
		archiveTableAlias?: string,
		joinTableAlias?: string
	) {
		return tableJoiner(
			this, 'logging_logindex',
			[ 'log_title', 'log_namespace' ] as LogColumns,
			[ 'ar_title', 'ar_namespace' ] as ArchiveColumns,
			columns, archiveTableAlias, joinTableAlias,
			( jc, src, trg ) => jc
				.andOn( src( 'log_type' ), this.client.raw( '?', [ 'delete' ] ) )
				.andOn(
					src( 'log_action' ),
					'LIKE',
					this.client.raw( '?', [ 'delete%' ] )
				)
				.andOn( src( 'log_timestamp' ), '>', trg( 'ar_timestamp' ) )
		);
	} );

}
