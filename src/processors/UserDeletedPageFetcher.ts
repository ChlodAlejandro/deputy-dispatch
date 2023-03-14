import { SiteMatrixSite } from '../util/WikimediaSiteMatrix';
import TitleFactory from '../util/Title';
import dbTimestamp from '../database/util/dbTimestamp';
import ReplicaConnection from '../database/ReplicaConnection';
import dbString from '../database/util/dbString';
import phpUnserialize from 'phpunserialize';
import { LogEntry } from '../models/Log';

declare module 'phpunserialize' {
	// eslint-disable-next-line @typescript-eslint/no-shadow
	export default function phpUnserialize( str: string ): any;
}

export interface PageDeletionInfo extends LogEntry {
	params: any;

	guessed: boolean;
}

export interface DeletedPage {
	pageid: number | null;
	ns: number;
	title: string;
	created: string;
	length: number;

	/**
	 * A log entry describing the deletion. If the log entry could not be found,
	 * either due to the deletion's age or ambiguity, this will be `true`.
	 */
	deleted: true | PageDeletionInfo;
}

/**
 *
 */
export default class UserDeletedPageFetcher {

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
	 * Fetches deleted pages by a user.
	 *
	 * We can assume in this case that the user is never `null` (i.e. the user
	 * is not wiped from the actor_userindex table) because the revision must
	 * have a valid actor (which, in this case, is always true).
	 *
	 * For pages that were deleted a long time ago (before MediaWiki 1.11), the
	 * real page ID cannot be determined. In such cases, this will attempt to
	 * find the first deletion that happened after the creation timestamp.
	 *
	 * @param user
	 */
	async fetch( user: string ): Promise<DeletedPage[]> {
		const conn = await ReplicaConnection.connect( this.site, this.type );
		const Title = await TitleFactory.get( this.site );
		const usernameTitle =
			new Title( user, Title.nameIdMap.user );

		const results = await conn.from( 'archive_userindex' )
			.select( [
				'ar_id',
				'ar_namespace',
				'ar_title',
				'ar_page_id',
				'ar_timestamp',
				'ar_len',
				conn.raw( `
					(
						SELECT GROUP_CONCAT(ctd_name SEPARATOR ",")
						FROM change_tag
						JOIN change_tag_def ON ctd_id = ct_tag_id
						WHERE ct_log_id = log_id
					) as ts_tags
				`.replace( /[\t\r\n]/g, ' ' ) )
			] )
			.withArchiveDeletion()
			.withLogActor( [ 'actor_name' ], null, 'ad' )
			.withLogComment( [ 'comment_text' ] )
			.where( 'ar_actor', conn
				.from( {
					a: 'actor_revision'
				} )
				.select( 'a.actor_id' )
				.where( 'a.actor_name', usernameTitle.getMainText() )
				.limit( 1 )
			)
			.andWhere( 'ar_parent_id', 0 );

		const resultsMap = new Map<number, DeletedPage>();

		for ( const row of results ) {
			const logMatches = row.log_id && ( row.ar_page_id === row.log_page );
			const getLogData = ( guessed: boolean ): true|PageDeletionInfo => row.log_id ? ( {
				logid: row.log_id,
				user: dbString( row.ad_actor_name ),
				comment: dbString( row.comment_text ),
				params: phpUnserialize( dbString( row.log_params ) ),
				timestamp: dbTimestamp( row.log_timestamp ).toISOString(),
				tags: row.ts_tags ? dbString( row.ts_tags ).split( ',' ) : [],
				guessed
			} ) : true;

			if ( !resultsMap.has( row.ar_id ) ) {
				const pageTitle = new Title(
					dbString( row.ar_title ), row.ar_namespace
				).getPrefixedText();

				resultsMap.set( row.ar_id, {
					pageid: row.ar_page_id ?? null,
					ns: row.ar_namespace,
					title: pageTitle,
					created: dbTimestamp( row.ar_timestamp ).toISOString(),
					length: row.ar_len,
					deleted: getLogData( !logMatches )
				} );
			} else {
				// Check if the log entry is deleted, and if we now have
				// a better candidate for the log entry.

				const existingEntry = resultsMap.get( row.ar_id );
				const logTimestamp = new Date( row.log_timestamp );
				if ( existingEntry?.deleted === true && logMatches ) {
					existingEntry.deleted = getLogData( false );
				} else if (
					existingEntry.deleted !== true &&
					// Timestamp of this entry is much closer to existing entry.
					new Date( existingEntry.deleted.timestamp ) > logTimestamp
				) {
					existingEntry.deleted = getLogData( true );
				} else if ( row.log_id != null ) {
					// An entry *does* exist, use it.
					existingEntry.deleted = getLogData( true );
				}
			}
		}

		return Array.from( resultsMap.values() );
	}

}
