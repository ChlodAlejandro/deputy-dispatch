import knex, { Knex as KnexOriginal } from 'knex';
import {
	actorColumns,
	ActorColumns,
	commentColumns,
	CommentColumns,
	pageColumns,
	PageColumns,
	tableJoiner,
	Writable
} from './DatabaseSchema';
import { ArrayOrNot } from '../../util/types/ArrayOrNot';

declare module 'knex' {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Knex {
		interface QueryBuilder {

			/**
			 * Join the log entries of another table.
			 *
			 * @param columns The columns to join
			 * @param joinSource The column to join on (on the source table).
			 * @param joinTarget The column to join using (on the target table).
			 * @param joinSourceAlias The alias of the table to join from
			 *   (if columns are ambiguous).
			 * @param joinTableAlias The alias of the table to join.
			 *   Use this if there are more than two logging tables in the query.
			 */
			withLogs: <TRecord, TResult>(
				joinSource: string,
				joinTarget: string,
				selectColumns?: ActorColumns,
				joinSourceAlias?: string,
				joinTableAlias?: string
			) => KnexOriginal.QueryBuilder<TRecord, TResult>;

			/**
			 * Join the actors of a query which has a logging table.
			 *
			 * @param columns The columns to join
			 * @param loggingTableAlias The alias of the logging table.
			 *   Use this if there are more than two logging tables in the query.
			 * @param joinTableAlias The alias of the table to join.
			 *   Use this if there are more than two actor tables in the query.
			 */
			withLogActor: <TRecord, TResult>(
				columns?: ActorColumns,
				loggingTableAlias?: string,
				joinTableAlias?: string
			) => KnexOriginal.QueryBuilder<TRecord, TResult>;

			/**
			 * Join the comments of a query which has a logging table.
			 *
			 * @param columns The columns to join
			 * @param loggingTableAlias The alias of the logging table.
			 *   Use this if there are more than two logging tables in the query.
			 * @param joinTableAlias The alias of the table to join.
			 *   Use this if there are more than two comment tables in the query.
			 */
			withLogComment: <TRecord, TResult>(
				columns?: CommentColumns,
				loggingTableAlias?: string,
				joinTableAlias?: string
			) => KnexOriginal.QueryBuilder<TRecord, TResult>;

			/**
			 * Join the pages of a query which has a logging table.
			 *
			 * @param columns The columns to join
			 * @param loggingTableAlias The alias of the logging table.
			 *   Use this if there are more than two logging tables in the query.
			 * @param joinTableAlias The alias of the table to join.
			 *   Use this if there are more than two page tables in the query.
			 */
			withLogPage: <TRecord, TResult>(
				columns?: PageColumns,
				loggingTableAlias?: string,
				joinTableAlias?: string
			) => KnexOriginal.QueryBuilder<TRecord, TResult>;
		}
	}
}

/**
 * Extends the Knex Query Builder with additional functions for easily querying
 * log data, such as performing joins with user name, edit summary, etc.
 */
export default function attachLogQueryBuilderExtensions() {

	knex.QueryBuilder.extend( 'withLog', function (
		joinSource: ArrayOrNot<string>,
		joinTarget: ArrayOrNot<string>,
		selectColumns?: ActorColumns,
		joinSourceAlias?: string,
		joinTableAlias?: string
	) {
		return tableJoiner(
			this, 'logging_logindex', joinSource, joinTarget,
			selectColumns, joinSourceAlias, joinTableAlias
		);
	} );

	knex.QueryBuilder.extend( 'withLogActor', function (
		columns: ActorColumns = actorColumns as Writable<typeof actorColumns>,
		loggingTableAlias?: string,
		joinTableAlias?: string
	) {
		return tableJoiner(
			this, 'actor_logging', 'log_actor', 'actor_id',
			columns, loggingTableAlias, joinTableAlias
		);
	} );

	knex.QueryBuilder.extend( 'withLogComment', function (
		columns: CommentColumns = commentColumns as Writable<typeof commentColumns>,
		loggingTableAlias?: string,
		joinTableAlias?: string
	) {
		return tableJoiner(
			this, 'comment_logging', 'log_comment_id', 'comment_id',
			columns, loggingTableAlias, joinTableAlias
		);
	} );

	knex.QueryBuilder.extend( 'withLogPage', function (
		columns: PageColumns = pageColumns as Writable<typeof pageColumns>,
		loggingTableAlias?: string,
		joinTableAlias?: string
	) {
		return tableJoiner(
			this, 'page', 'log_page', 'page_id',
			columns, loggingTableAlias, joinTableAlias
		);
	} );

	knex.QueryBuilder.extend( 'withLogTags', function (
		columns: PageColumns = pageColumns as Writable<typeof pageColumns>,
		loggingTableAlias?: string,
		joinTableAlias?: string
	) {
		return tableJoiner(
			this, 'page', 'log_page', 'page_id',
			columns, loggingTableAlias, joinTableAlias
		);
	} );

}
