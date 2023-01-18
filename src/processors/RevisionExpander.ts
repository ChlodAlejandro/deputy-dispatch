import { isValidRevision, MissingRevision, Revision, RevisionData } from '../models/Revision';
import { ApiResponse, mwn } from 'mwn';
import fakePromise, { FakePromise } from '../util/func/fakePromise';
import stagger from '../util/func/stagger';
import Dispatch from '../Dispatch';

/**
 * @example https://w.wiki/6Dzt
 */
interface ApiQueryRevisionResponse extends ApiResponse {
	query: {
		badrevids?: Record<string, MissingRevision>;
		pages: {
			pageid: number,
			ns: number,
			title: string,
			revisions: RevisionData[]
		}[]
	}
}

/**
 * Class for expanding revisions into their Deputy-usable versions.
 *
 * The expander works as a staggered requester. Once revisions are submitted,
 * a promise is returned which eventually resolves to the expanded revision.
 * Revisions are requested in batches to avoid overloading the MediaWiki
 * server.
 */
export default class RevisionExpander {

	static readonly PER_BATCH = 50;

	revisionQueue: Record<number, FakePromise<Revision>> = {};

	/**
	 * @param client The client to use for requests.
	 */
	constructor( private client: mwn ) {
		/* ignored */
	}

	readonly run = stagger( ( async function () {
		const forProcessing = new Map<number, FakePromise<Revision>>();
		for ( const revisionId in this.revisionQueue ) {
			if ( forProcessing.size >= RevisionExpander.PER_BATCH ) {
				break;
			}

			forProcessing.set( +revisionId, this.revisionQueue[ +revisionId ] );
			delete this.revisionQueue[ +revisionId ];
		}

		const resolvedRevisions: Record<number, Revision> =
			await this.request( Array.from( forProcessing.keys() ) );
		for ( const [ id, revisionData ] of Object.entries( resolvedRevisions ) ) {
			forProcessing.get( +id ).resolver( revisionData );
			delete this.revisionQueue[ +id ];
		}
	} ).bind( this ), () => Object.keys( this.revisionQueue ).length > 0 );

	/**
	 * Queues a set of revisions into the expander. The expander will request
	 * all of these and return appropriate promises.
	 *
	 * @param revisions
	 * @return A set of revisions and their respective Promises.
	 */
	queue( revisions: number[] ): Record<number, Promise<Revision>> {
		const fakePromises = {};
		for ( const rev of revisions ) {
			const revPromise = fakePromise<Revision>();
			this.revisionQueue[ rev ] = revPromise;
			fakePromises[ rev ] = revPromise.promise;
			Dispatch.i.log.trace( `Revision queued for query: ${rev}` );
		}
		this.run();
		return fakePromises;
	}

	/**
	 * Process an actual data request. Called by the staggered requester, or
	 * directly by anything that might need expanded revisions.
	 *
	 * @param revisions
	 */
	async request( revisions: number[] ): Promise<Record<number, Revision>> {
		Dispatch.i.log.debug( `Expanding ${revisions.length} revisions...` );
		const revisionBank: Record<number, Revision> = {};
		const parentRevisionIds: number[] = [];
		const parentRevisionSizes: Record<number, number> = {};

		// Get primary revision data
		const primaryRevisions = await this.requestBase(
			revisions,
			[
				'ids', 'timestamp', 'flags', 'comment',
				'parsedcomment', 'user', 'size', 'tags'
			]
		);

		for ( const response of primaryRevisions ) {
			for ( const page of ( response.query.pages ?? [] ) ) {
				for ( const rev of page.revisions ) {
					revisionBank[ rev.revid ] = Object.assign(
						rev,
						{
							page: Object.assign( {}, page, { revisions: undefined } )
						}
					);
					// Note that at this point, we still don't have diff sizes. We'll get that
					// in the next query.
					if ( rev.parentid ) {
						parentRevisionIds.push( rev.parentid );
					}
				}
			}
			if ( response.query.badrevids ) {
				for ( const badRevId of Object.values( response.query.badrevids ) ) {
					revisionBank[ badRevId.revid ] = badRevId as MissingRevision;
				}
			}
		}

		// Now get parent revision size
		const parentRevisions = await this.requestBase(
			parentRevisionIds,
			[ 'ids', 'size' ]
		);

		for ( const response of parentRevisions ) {
			for ( const page of response.query.pages ) {
				for ( const rev of page.revisions ) {
					parentRevisionSizes[ rev.revid ] = rev.size;
				}
				// No need to perform missing check, parentRevisionIds should only
				// contain valid revision IDs.
			}
		}

		for ( const revision of Object.values( revisionBank ) ) {
			if ( isValidRevision( revision ) && revision.parentid ) {
				revision.diffsize = revision.size - parentRevisionSizes[ revision.parentid ];
			}
		}

		return revisionBank;
	}

	/**
	 * Make a MediaWiki API request for revisions with a given set of revisions
	 * and props.
	 *
	 * @param revisions
	 * @param props
	 * @private
	 */
	private async requestBase(
		revisions: number[],
		props: string[]
	): Promise<ApiQueryRevisionResponse[]> {
		Dispatch.i.log.trace( `Querying data for ${revisions.length} revisions (props=${
			props.join( '|' )
		})...` );
		return await this.client.massQuery( {
			action: 'query',
			format: 'json',
			prop: 'revisions',
			rvprop: props.join( '|' ),
			revids: revisions
		}, 'revids' ) as any;
	}

}
