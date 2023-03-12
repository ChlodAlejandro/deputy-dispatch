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

			/**
			 * Only selects revisions with the given tag.
			 *
			 * @param tags The list of tags that must be present on the revision.
			 * @param revisionTableAlias The alias of the revision table.
			 */
			withTags: <TRecord, TResult>(
				tags: string[],
				revisionTableAlias?: string
			) => KnexOriginal.QueryBuilder<TRecord, TResult>;

			/**
			 * Only selects revisions without the given tag.
			 *
			 * @param tags The list of tags that must not be present on the revision.
			 * @param revisionTableAlias The alias of the revision table.
			 */
			withoutTags: <TRecord, TResult>(
				tags: string[],
				revisionTableAlias?: string
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

	knex.QueryBuilder.extend( 'withTags', function (
		tags: string[],
		revisionTableAlias?: string
	) {
		const revIdCol = `${ revisionTableAlias ? revisionTableAlias + '.' : '' }rev_id`;

		for ( const tag of tags ) {
			const joinKey = `ct_has_tag_${
				tag.replace( /^[a-z0-9_]/gi, '_' )
			}_${ Math.floor( Math.random() * 1e8 ) }`;
			const joinColumn = ( s ) => `${joinKey}.${s}`;
			this.leftJoin(
				{ [ joinKey ]: 'change_tag' },
				( clause ) => clause
					.on( joinColumn( 'ct_rev_id' ), revIdCol )
					.andOnVal( joinColumn( 'ct_tag_id' ), this.client.queryBuilder()
						.from( 'change_tag_def' )
						.select( 'ctd_id' )
						.where( 'ctd_name', tag )
					)
			);
			this.andWhereNot(
				joinColumn( 'ct_rev_id' ),
				null
			);
		}

		return this;
	} );

	knex.QueryBuilder.extend( 'withoutTags', function (
		tags: string[],
		revisionTableAlias?: string
	) {
		const revIdCol = `${ revisionTableAlias ? revisionTableAlias + '.' : '' }rev_id`;

		for ( const tag of tags ) {
			const joinKey = `ct_has_no_tag_${
				tag.replace( /^[a-z0-9_]/gi, '_' )
			}_${ Math.floor( Math.random() * 1e8 ) }`;
			const joinColumn = ( s ) => `${joinKey}.${s}`;
			this.leftJoin(
				{ [ joinKey ]: 'change_tag' },
				( clause ) => clause
					.on( joinColumn( 'ct_rev_id' ), revIdCol )
					.andOnVal( joinColumn( 'ct_tag_id' ), this.client.queryBuilder()
						.from( 'change_tag_def' )
						.select( 'ctd_id' )
						.where( 'ctd_name', tag )
					)
			);
			this.andWhere(
				joinColumn( 'ct_rev_id' ),
				null
			);
		}

		return this;
	} );

}
