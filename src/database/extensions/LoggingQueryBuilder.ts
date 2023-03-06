import knex, { Knex as KnexOriginal } from 'knex';
import {
	actorColumns,
	ActorColumns,
	commentColumns,
	CommentColumns, pageColumns, PageColumns,
	tableJoiner,
	Writable
} from './DatabaseSchema';

declare module 'knex' {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Knex {
		interface QueryBuilder {

			/**
			 * tableJoiner the actors of a query which has a logging table.
			 *
			 * @param columns The columns to tableJoiner
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
			 * tableJoiner the comments of a query which has a logging table.
			 *
			 * @param columns The columns to tableJoiner
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
			 * tableJoiner the pages of a query which has a logging table.
			 *
			 * @param columns The columns to tableJoiner
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

}
