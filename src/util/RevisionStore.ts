import WikimediaStream, { EventSourceState, WikimediaEventStream } from 'wikimedia-streams';
import { isValidRevision, Revision } from '../models/Revision';
import Dispatch from '../Dispatch';
import toolUserAgent from './func/toolUserAgent';

/**
 * Like a map but for revisions. Once initialized, this will hook onto a Wikimedia
 * stream and listen for deleted revisions and immediately remove any cached revisions
 * that may have related data for safety. It will also listen for tag changes to append
 * tags to the appropriate revision when needed.
 *
 * For safety, sets cannot occur if the stream is closed.
 */
export default class RevisionStore extends Map<number, Revision> {

	/**
	 * Create a new RevisionStore.
	 *
	 * @param privileged Whether this revision store is running as privileged. A
	 * privileged revision store will NOT listen for changes to revision visibility,
	 * as it is assumed that the user has access to all revisions. Note that this
	 * can cause suppressed data to leak out into user interfaces. Use sparingly
	 * and only behind authenticated interfaces.
	 * @param autostart
	 * @param {...any} args Arguments to be passed to the Map constructor
	 */
	constructor( private readonly privileged?: boolean, autostart?: boolean, ...args: any[] ) {
		super( ...args );
		if ( autostart ) {
			this.startStream();
		}
	}

	stream: WikimediaStream;

	/**
	 * @inheritDoc
	 */
	set( key: number, value: Revision ): this {
		if ( !this.stream || this.stream.status !== EventSourceState.Open ) {
			Dispatch.i.log.warn( `Cannot set revision ${key} while stream is closed.` );
		} else {
			super.set( key, value );
		}
		return this;
	}

	/**
	 * Starts listening for new revisions.
	 */
	startStream() {
		if ( !this.stream ) {
			this.stream = new WikimediaStream( [
				!this.privileged && 'mediawiki.revision-visibility-change',
				'mediawiki.revision-tags-change'
			].filter( v => !!v ) as WikimediaEventStream[], {
				headers: {
					'User-Agent': toolUserAgent
				}
			} );
			if ( !this.privileged ) {
				this.stream.on( 'mediawiki.revision-visibility-change', ( data ) => {
					const oldRev = this.get( data.rev_id );
					if ( oldRev && isValidRevision( oldRev ) ) {
						this.set( data.rev_id, Object.assign(
							{},
							oldRev,
							{
								comment: data.visibility.comment ? oldRev.comment : '',
								user: data.visibility.user ? oldRev.user : '',
								visibility: data.visibility
							}
						) );
					}
				} );
			}
			this.stream.on( 'mediawiki.revision-tags-change', ( data ) => {
				const revision = this.get( data.rev_id );
				if ( revision && isValidRevision( revision ) ) {
					revision.tags = data.tags;
				}
			} );
		}
		if (
			this.stream.status !== EventSourceState.Open &&
			this.stream.status !== EventSourceState.Connecting
		) {
			this.stream.open();
		}
	}

	/**
	 * Stops listening for new revisions.
	 */
	stopStream() {
		this.stream.close();
	}

}
