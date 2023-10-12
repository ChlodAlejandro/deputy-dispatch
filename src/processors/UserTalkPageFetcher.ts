import { SiteMatrixSite } from '../util/WikimediaSiteMatrix';
import ReplicaConnection from '../database/ReplicaConnection';
import WikimediaSessionManager from './WikimediaSessionManager';
import { Revision } from '../models/Revision';
import { mwn, MwnTitle } from 'mwn';
import { stringMatches } from 'strfnr';
import countInstances from '../util/func/countInstances';
import Log from '../util/Log';
import regexClone from '../util/func/regexClone';
import { AsyncTask } from '../routes/abstract/AsyncTask';

type UserTalkPageFetcherFilter = string | string[] | RegExp | { source: string, flags: string };

export interface PageFilterInfo {
	filter: string;
	matches: string[];
	action: 'add' | 'remove';
}

export interface PageRevisions {
	pageid: number;
	ns: number;
	title: string;
	revisions: ( Revision & PageFilterInfo )[];
}

/**
 *
 */
export default class UserTalkPageFetcher {

	/**
	 * Fetches the talk page revisions of a user. Obviously, every single revision
	 * would be too expensive to send to the user, so this includes server-side
	 * filtering.
	 *
	 * @param user
	 * @param site
	 * @param filter
	 * @param task
	 */
	static async fetch(
		user: string,
		site: SiteMatrixSite,
		filter: UserTalkPageFetcherFilter,
		task?: AsyncTask<any>
	): Promise<PageRevisions> {
		const mw = await WikimediaSessionManager.getClient( site );
		// Library issue. What can I do about it?
		// eslint-disable-next-line new-cap
		const userTalk = new mw.title( user, mw.title.nameIdMap.user_talk );

		if ( filter instanceof RegExp ) {
			filter = regexClone( filter, 'g' );
		} else if ( typeof filter === 'object' && !Array.isArray( filter ) ) {
			if ( !filter.flags.includes( 'g' ) ) {
				filter.flags += 'g';
			}
		}

		const progressEnabled = ReplicaConnection.ENABLED && task;
		let updateFunction;
		if ( progressEnabled ) {
			const totalRevisionCount = UserTalkPageFetcher.getRevisionCount( site, userTalk );
			updateFunction = async ( revisionCount ) => {
				task.updateProgress( revisionCount / await totalRevisionCount );
			};
		}

		return UserTalkPageFetcher
			.processRevisions( mw, userTalk, filter, updateFunction )
			.then( ( revisions ) => {
				if ( task ) {
					task.finish( revisions );
				}
				return revisions;
			} );
	}

	/**
	 * Get the number of revisions for a page.
	 *
	 * @param site
	 * @param pageTitle
	 */
	static async getRevisionCount( site: SiteMatrixSite, pageTitle: MwnTitle ): Promise<number> {
		const db = await ReplicaConnection.connect( site, 'analytics' );
		return db.from( 'revision' )
			.count( { count: 'rev_id' } )
			.where( 'rev_page', db.from( 'page' )
				.select( 'page_id' )
				.where( 'page_namespace', pageTitle.namespace )
				.where( 'page_title', pageTitle.getMain() )
			)
			.first()
			.then( r => {
				Log.trace( `Expecting ${r.count} revisions...`, r );
				return r.count;
			} );
	}

	/**
	 * Perform a linear search for text on the given page.
	 *
	 * @param mw
	 * @param pageTitle
	 * @param filter
	 * @param onProgress A progress update function. The function is called with the
	 * number of processed revisions after each API call.
	 */
	static async processRevisions(
		mw: mwn,
		pageTitle: MwnTitle,
		filter: UserTalkPageFetcherFilter,
		onProgress: ( revisionCount: number ) => any
	): Promise<PageRevisions> {
		let pageid = null;
		let ns = null;
		let title = null;

		let processedRevisions = 0;

		const history: ( Revision & PageFilterInfo )[] = [];
		let lastHits = new Map( Array.isArray( filter ) ? filter.map( f => [ f, 0 ] ) : [] );
		for await ( const response of mw.continuedQueryGen( {
			action: 'query',
			prop: 'revisions',
			titles: pageTitle.getPrefixedText(),
			rvprop: 'ids|timestamp|flags|parsedcomment|comment|user|content',
			rvslots: 'main', // TODO: Slot support
			rvlimit: 'max',
			rvdir: 'newer'
		} ) ) {
			pageid = pageid ?? response.query.pages[ 0 ].pageid;
			ns = ns ?? response.query.pages[ 0 ].ns;
			title = title ?? response.query.pages[ 0 ].title;

			for ( const revision of response.query.pages[ 0 ].revisions ) {
				if ( revision.slots.main.content == null ) {
					// Revision deleted, skip
					continue;
				}

				// Compare with filters
				const content = revision.slots.main.content;
				const matches = stringMatches( content, filter );
				const filterSanitized = [];
				const filterLookup = {};
				for ( const { filter: matchFilter } of matches.offset ) {
					const filterJson = JSON.stringify( matchFilter );
					filterSanitized.push( filterJson );
					filterLookup[ filterJson ] = matchFilter;
				}
				const hits = countInstances(
					filterSanitized,
					[
						...( Array.isArray( filter ) ? filter : [] ),
						...lastHits.keys()
					]
				);

				// Get rid of content now to omit it from output data
				delete revision.slots;

				for ( const [ hitFilter, hitCount ] of hits.entries() ) {
					const hitDelta = hitCount - ( lastHits.get( hitFilter ) ?? 0 );
					if ( hitDelta > 0 ) {
						// New filter hit
						const matchedStrings = matches.offset.map( v =>
							content.slice( v.start, v.end )
						);
						for ( let i = 0; i < hitDelta; i++ ) {
							history.push( {
								...( revision as Revision ),
								filter: filterLookup[ hitFilter ],
								action: 'add',
								matches: matchedStrings
							} );
						}
					} else if ( hitDelta < 0 ) {
						// Removed filter hit
						const matchedStrings = matches.offset.map( v =>
							content.slice( v.start, v.end )
						);
						for ( let i = 0; i < Math.abs( hitDelta ); i++ ) {
							history.push( {
								...( revision as Revision ),
								filter: filterLookup[ hitFilter ],
								action: 'remove',
								matches: matchedStrings
							} );
						}
					}
				}

				lastHits = hits;
			}

			processedRevisions += response.query.pages[ 0 ].revisions.length;
			Log.trace( `Processed ${processedRevisions} revisions...` );
			if ( onProgress ) {
				onProgress( processedRevisions );
			}
		}

		return {
			pageid, ns, title,
			revisions: history
		};
	}

}
