import { SiteMatrixSite } from '../util/WikimediaSiteMatrix';
import ReplicaConnection from '../database/ReplicaConnection';
import { Knex } from 'knex';

/**
 * Fetches revisions from the Replica database.
 */
export default class DatabaseRevisionFetcher {

	/**
	 * Creates a new DatabaseRevisionFetcher object
	 *
	 * @param site The site to run queries on
	 * @param type Which Replica to use (web = interactive, analytics = less load)
	 */
	constructor(
		readonly site: SiteMatrixSite,
		readonly type: 'analytics' | 'web'
	) {
	}

	/**
	 * Query the Replica databases for revisions. This returns revisions nearly
	 * identical ta {@link ExpandedRevision} except "parsedcomment" is not provided
	 * (since parsed comments are not stored on the database).
	 *
	 * The functionality of the scraper can be further extended using the processor.
	 * The processor allows modification of the Knex query builder, allowing for
	 * additional JOINs and filtering. For sub-queries, the processor receives the
	 * Knex connection as a second parameter.
	 *
	 * When getting revision information with `processor`, prefix columns in `revision`
	 * with `main` or `parent`. `main` is the revision actually being targeted,
	 * `parent` is the parent revision (the previous revision). Not doing so will
	 * result in ambiguous column names.
	 *
	 * @param processor Query builder and connection extender
	 */
	async fetch(
		processor: ( qb: Knex.QueryBuilder, conn: Knex ) => Knex.QueryBuilder
		= ( qb ) => qb
	) {
		const conn = await ReplicaConnection.connect( this.site, this.type );

		return processor(
			conn( { main: 'revision_userindex' } )
				.select(
					'main.rev_id',
					'main.rev_parent_id',
					'main.rev_minor_edit',
					'main.rev_timestamp',
					'main.rev_len'
				)
				.withRevisionParents( [ 'rev_len' ], 'main', 'parent' )
				.withRevisionActor( [ 'actor_name' ], 'main' )
				.withRevisionComment( [ 'comment_text' ], 'main' )
				.withRevisionPage( [ 'page_id', 'page_title', 'page_namespace' ], 'main' ),
			conn
		)
			.orderBy( 'main.rev_timestamp', 'desc' );
	}

}
