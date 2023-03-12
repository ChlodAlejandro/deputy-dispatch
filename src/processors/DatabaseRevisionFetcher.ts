import { SiteMatrixSite } from '../util/WikimediaSiteMatrix';
import ReplicaConnection from '../database/ReplicaConnection';
import { Knex } from 'knex';
import { PossibleDeletedRevision } from '../models/DeletedRevision';
import dbTimestamp from '../database/util/dbTimestamp';
import dbString from '../database/util/dbString';
import TitleFactory from '../util/Title';
import { MwnTitleStatic } from 'mwn/build/title';
import { ExpandedRevision } from '../models/Revision';

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
	 * @param conn
	 * @param Title
	 * @param processor Query builder and connection extender
	 */
	static async fetch(
		conn: Knex,
		Title: MwnTitleStatic,
		processor: ( qb: Knex.QueryBuilder, conn: Knex ) => Knex.QueryBuilder
		= ( qb ) => qb
	): Promise<Omit<ExpandedRevision, 'parsedcomment'>[]> {
		return processor(
			conn( { main: 'revision_userindex' } )
				.select(
					'main.rev_id',
					'main.rev_parent_id',
					'main.rev_minor_edit',
					'main.rev_timestamp',
					'main.rev_len',
					'main.rev_comment_id',
					'main.rev_actor'
				)
				.withRevisionParents( [ 'rev_len' ], 'main', 'parent' )
				.withRevisionActor( [ 'actor_name' ], 'main' )
				.withRevisionComment( [ 'comment_text' ], 'main' )
				.withRevisionPage( [ 'page_id', 'page_title', 'page_namespace' ], 'main' ),
			conn
		)
			.then( d => d.map( v => ( <PossibleDeletedRevision>{
				revid: +v.rev_id,
				parentid: +v.rev_parent_id,
				minor: !!v.rev_minor_edit,
				user: v.actor_name ?
					new Title( dbString( v.actor_name ), Title.nameIdMap.user ).getMainText() :
					null,
				timestamp: v.rev_timestamp ? dbTimestamp( v.rev_timestamp ).toISOString() : null,
				size: v.rev_len,
				comment: v.comment_text ? dbString( v.comment_text ) : null,
				tags: dbString( v.ts_tags ).split( ',' ),
				page: {
					pageid: +v.page_id,
					title: new Title(
						dbString( v.page_title ), +v.page_namespace
					).getPrefixedText(),
					ns: +v.page_namespace
				},
				diffsize: v.rev_len - v.parent_rev_len,

				...( v.rev_comment_id ? { commenthidden: true } : {} ),
				...( v.rev_actor ? { userhidden: true } : {} )
			} ) ) );
	}

	/**
	 * @param processor Query builder and connection extender
	 * @see DatabaseRevisionFetcher.fetch
	 */
	async fetch(
		processor: ( qb: Knex.QueryBuilder, conn: Knex ) => Knex.QueryBuilder
		= ( qb ) => qb
	): Promise<Omit<ExpandedRevision, 'parsedcomment'>[]> {
		const conn = await ReplicaConnection.connect( this.site, this.type );
		const Title = await TitleFactory.get( this.site );
		return DatabaseRevisionFetcher.fetch( conn, Title, processor );
	}

}
