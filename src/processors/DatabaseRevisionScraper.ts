import { SiteMatrixSite } from '../util/WikimediaSiteMatrix';
import ReplicaConnection from '../database/ReplicaConnection';
import TitleFactory from '../util/Title';
import dbTimestamp from '../util/func/dbTimestamp';
import { Knex } from 'knex';
import { ExpandedRevision } from '../models/Revision';

type DatabaseExpandedRevision = Omit<ExpandedRevision, 'parsedcomment'>;

/**
 *
 */
export default class DatabaseRevisionScraper<T = DatabaseExpandedRevision> {

	/**
	 * Scrape the Replica databases for revisions. This returns revisions nearly
	 * identical ta {@link ExpandedRevision} except "parsedcomment" is not provided
	 * (since parsed comments are not stored on the database).
	 *
	 * The functionality of the scraper can be further extended using the processor.
	 * The processor allows modification of the Knex query builder, allowing for
	 * additional JOINs and filtering. For sub-queries, the processor receives the
	 * Knex connection as a second parameter.
	 *
	 * @param site The site to run queries on
	 * @param type Which Replica to use (web = interactive, analytics = less load)
	 * @param processor Query builder and connection extender
	 */
	async scrape(
		site: SiteMatrixSite,
		type: 'analytics' | 'web',
		processor: ( qb: Knex.QueryBuilder, conn: Knex ) => Knex.QueryBuilder = ( qb ) => qb
	): Promise<T> {
		const ACTOR_NAME = 'Chlod';
		const conn = await ReplicaConnection.connect( site, type );
		const Title = await TitleFactory.get( site );

		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		return processor(
			conn( { main: 'revision_userindex' } )
				.select(
					'main.rev_id',
					'main.rev_parent_id',
					'main.rev_minor_edit',
					'main.rev_timestamp',
					'main.rev_len',
					'comment_text',
					'page_id',
					'page_title',
					'page_namespace',
					'parent.rev_len as rev_parent_len'
				)
				.leftJoin(
					{ parent: 'revision_userindex' },
					'main.rev_parent_id', 'parent.rev_id'
				)
				.leftJoin(
					'comment_revision',
					'main.rev_comment_id', 'comment_id'
				)
				.leftJoin(
					'page', 'main.rev_page', 'page_id'
				),
			conn
		)
			.orderBy( 'main.rev_timestamp', 'desc' )
			.then( d => Promise.all( d.map( async v => ( {
				revid: +v.rev_id,
				parentid: +v.rev_parent_id,
				minor: !!v.rev_minor_edit,
				user: ACTOR_NAME,
				timestamp: dbTimestamp( v.rev_timestamp ).toISOString(),
				size: v.rev_len,
				comment: v.comment_text ? v.comment_text.toString( 'utf8' ) : '',
				page: {
					id: +v.page_id,
					title: Title.makeTitle(
						+v.page_namespace, v.page_title.toString( 'utf8' )
					).getPrefixedText(),
					ns: +v.page_namespace
				},
				diffsize: v.rev_len - v.rev_parent_len
			} ) ) ) );
	}

}
