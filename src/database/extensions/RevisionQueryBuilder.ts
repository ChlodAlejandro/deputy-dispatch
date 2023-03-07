import knex, { Knex as KnexOriginal } from 'knex';
import {
	actorColumns,
	ActorColumns, commentColumns,
	CommentColumns,
	pageColumns,
	PageColumns,
	RevisionColumns, tableJoiner, Writable
} from './DatabaseSchema';

declare module 'knex' {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Knex {
		interface QueryBuilder {
			/**
			 * Join extra revisions from a query which has a revision table.
			 *
			 * @param columns The columns to join
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
			 * Join the actors of a query which has a revision table.
			 *
			 * @param columns The columns to join
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
			 * Join the comments of a query which has a revision table.
			 *
			 * @param columns The columns to join
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
			 * Join the pages of a query which has a revision table.
			 *
			 * @param columns The columns to join
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
 * revision data, such as performing joins with user name, edit summary, etc.
 */
export default function attachRevisionQueryBuilderExtensions() {

	knex.QueryBuilder.extend( 'withRevisionParents', function (
		columns: RevisionColumns,
		revisionTableAlias?: string,
		joinTableAlias?: string
	) {
		return tableJoiner(
			this, 'revision', 'rev_parent_id', 'rev_id',
			columns, revisionTableAlias, joinTableAlias
		);
	} );

	knex.QueryBuilder.extend( 'withRevisionActor', function (
		columns: ActorColumns = actorColumns as Writable<typeof actorColumns>,
		revisionTableAlias?: string,
		joinTableAlias?: string
	) {
		return tableJoiner(
			this, 'actor_revision', 'rev_actor', 'actor_id',
			columns, revisionTableAlias, joinTableAlias
		);
	} );

	knex.QueryBuilder.extend( 'withRevisionComment', function (
		columns: CommentColumns = commentColumns as Writable<typeof commentColumns>,
		revisionTableAlias?: string,
		joinTableAlias?: string
	) {
		return tableJoiner(
			this, 'comment_revision', 'rev_comment_id', 'comment_id',
			columns, revisionTableAlias, joinTableAlias
		);
	} );

	knex.QueryBuilder.extend( 'withRevisionPage', function (
		columns: PageColumns = pageColumns as Writable<typeof pageColumns>,
		revisionTableAlias?: string,
		joinTableAlias?: string
	) {
		return tableJoiner(
			this, 'page', 'rev_page', 'page_id',
			columns, revisionTableAlias, joinTableAlias
		);
	} );

}
