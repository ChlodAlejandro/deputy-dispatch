import {
	BodyProp,
	Controller,
	Get,
	Path,
	Post,
	Query,
	Request,
	Response,
	Route,
	SuccessResponse,
	Tags
} from 'tsoa';
import { ErrorFormat, ErrorResponse } from '../../../models/ErrorResponse';
import { Revision } from '../../../models/Revision';
import { WikimediaSiteMatrix } from '../../../util/WikimediaSiteMatrix';
import express from 'express';
import RevisionStore from '../../../util/RevisionStore';
import RevisionExpander from '../../../processors/RevisionExpander';
import WikimediaSessionManager from '../../../processors/WikimediaSessionManager';
import Log from '../../../util/Log';
import timeoutPromise from '../../../util/func/timeoutPromise';
import isPromisePending from '../../../util/func/isPromisePending';
import ErrorResponseBuilder from '../../../util/ErrorResponseBuilder';

/**
 *
 */
@Tags( 'Revisions' )
@Route( 'v1/revisions' )
export class MediaWikiRevisionController extends Controller {

	static readonly GET_LIMIT = 50;

	static readonly errorUnsupportedWiki = new ErrorResponseBuilder()
		.add( 'unsupportedwiki', {
			text: 'This wiki is not a supported Wikimedia wiki',
			key: 'apierror-unsupportedwiki'
		} );
	static readonly errorRevisionsMissing = new ErrorResponseBuilder()
		.add( 'revisions-missing', {
			text: 'No revisions were provided in the request',
			key: 'apierror-missingparam'
		} );
	static readonly errorRevisionsInteger = new ErrorResponseBuilder()
		.add( 'badinteger', {
			text: 'One of the revisions provided is not a valid integer',
			key: 'apierror-badinteger'
		} );
	static readonly errorMethodLimited = new ErrorResponseBuilder()
		.add( 'method-limited', {
			text: `GET requests are limited up to ${
				MediaWikiRevisionController.GET_LIMIT
			} revisions per request`,
			key: 'apierror-missingparam',
			params: [ `${MediaWikiRevisionController.GET_LIMIT}` ]
		} );
	static readonly errorExpanderTimeout = new ErrorResponseBuilder()
		.add( 'expander-timeout', {
			text: 'Timed out trying to get revision information',
			key: 'apierror-badinteger'
		} );

	static revisionStore = new RevisionStore( false, true );
	/**
	 * Administrator-only revision store. Requires authentication for access.
	 *
	 * TODO: Unused. Use when authenticate is developed.
	 */
	static privilegedRevisionStore = new RevisionStore( true, true );

	/**
	 * Get Deputy-decorated revisions from a list of revision IDs.
	 *
	 * @param req Express request object
	 * @param wiki Database name of the wiki
	 * @param revisions Revision IDs to process, separated by pipes (`|`)
	 * @return Expanded revisions for Deputy
	 */
	@Get( '{wiki}' )
	@Response<ErrorResponse>(
		422,
		'Unprocessable entity',
		ErrorResponseBuilder.generic.build()
	)
	@SuccessResponse( 200, 'OK' )
	public async getRevisionsGet(
		@Request() req: express.Request,
		@Path() wiki: string,
		@Query() revisions: string
	): Promise<{ version: 1, revisions: Record<number, Revision> } | ErrorResponse> {
		return this.getRevisions( req, wiki, revisions.split( '|' ) );
	}

	/**
	 * Get Deputy-decorated revisions from a list of revision IDs.
	 *
	 * @param req Express request object
	 * @param wiki Database name of the wiki
	 * @param revisions Revision IDs to process, separated by pipes (`|`)
	 * @return Expanded revisions for Deputy
	 */
	@Post( '{wiki}' )
	@Response<ErrorResponse>(
		422,
		'Unprocessable entity',
		ErrorResponseBuilder.generic.build()
	)
	@SuccessResponse( 200, 'OK' )
	public async getRevisionsPost(
		@Request() req: express.Request,
		@Path() wiki: string,
		@BodyProp() revisions: number|number[]|string|string[]
	): Promise<{ version: 1, revisions: Record<number, Revision> } | ErrorResponse> {
		return this.getRevisions(
			req,
			wiki,
			typeof revisions === 'string' ?
				revisions.split( '|' ) :
				( Array.isArray( revisions ) ? revisions : [ revisions ] )
		);
	}

	/**
	 *
	 * @param req
	 * @param wiki
	 * @param revisions
	 */
	async getRevisions(
		req: express.Request,
		wiki: string,
		revisions: ( string|number )[]
	): Promise<{ version: 1, revisions: Record<number, Revision> } | ErrorResponse> {
		const site = await WikimediaSiteMatrix.i.getDbName( wiki );

		if ( !site || site.nonglobal !== undefined ) {
			this.setStatus( 422 );
			return MediaWikiRevisionController.errorUnsupportedWiki.build(
				req.params.errorformat as ErrorFormat
			);
		}

		// Clean up revisions array
		revisions = revisions.filter( v => !!v && ( typeof v === 'number' || v.length > 0 ) );

		if ( revisions.length === 0 ) {
			this.setStatus( 422 );
			return MediaWikiRevisionController.errorRevisionsMissing.build(
				req.params.errorformat as ErrorFormat
			);
		}
		if ( revisions.length > 50 && req.method === 'GET' ) {
			this.setStatus( 403 );
			return MediaWikiRevisionController.errorMethodLimited.build(
				req.params.errorformat as ErrorFormat
			);
		}
		if ( revisions.some( v => isNaN( +v ) ) ) {
			this.setStatus( 422 );
			return MediaWikiRevisionController.errorRevisionsInteger.build(
				req.params.errorformat as ErrorFormat
			);
		}

		const finalRevisions: Record<number, Revision> = {};

		/**
		 * Revision IDs which must be processed.
		 */
		const forProcessing = [];

		for ( const revisionIdString of revisions ) {
			const revisionId = +revisionIdString;
			if ( isNaN( revisionId ) || ( +revisionId ) < 1 ) {
				finalRevisions[ revisionId ] = {
					revid: revisionId,
					invalid: true
				};
			} else if ( RevisionStore ) {
				// TODO: Use privileged store here, based on auth.
				const revision = await MediaWikiRevisionController.revisionStore.get( revisionId );
				if ( revision ) {
					finalRevisions[ revisionId ] = revision;
				} else {
					forProcessing.push( revisionId );
				}
			}
		}

		// Skip processing if there's nothing to process.
		if ( forProcessing.length > 0 ) {
			// TODO: User authentication. In such case, use WikimediaSessionManager to create a
			// client object from scratch. Whether this object should be persisted... /shrug
			const client = await WikimediaSessionManager.getClient( site );
			Log.debug( 'mwn for default client ready' );
			const expander = new RevisionExpander( client );
			const processingRevisions = expander.queue( forProcessing );
			try {
				await Promise.race( [
					Promise.all( Object.values( processingRevisions ) ),
					timeoutPromise( 10000, 'Revision processing timed out' )
				] );

				Log.debug( `Revisions processed... ${
					Object.keys( processingRevisions ).length
				} total.` );
				for ( const [ revision, promise ] of Object.entries( processingRevisions ) ) {
					// At this point, the promises are done.
					// The "await" takes it out of their shell.
					const expandedRevision = await promise;
					finalRevisions[ +revision ] = expandedRevision;
					MediaWikiRevisionController.revisionStore.set( +revision, expandedRevision );
				}
			} catch ( e ) {
				const unfinishedRevisions = Object.entries( processingRevisions )
					.filter( ( [ , promise ] ) => isPromisePending( promise ) )
					.map( ( [ revision ] ) => revision );
				Log.error( e, {
					unfinishedRevisions,
					unfinishedRevisionCount: unfinishedRevisions.length
				} );
				this.setStatus( 500 );
				return MediaWikiRevisionController.errorExpanderTimeout.build(
					req.params.errorformat as ErrorFormat
				);
			}
		}

		return { version: 1, revisions: finalRevisions };
	}

}
