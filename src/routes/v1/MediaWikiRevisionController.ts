import { Get, Path, Query, Route, Response, Controller, SuccessResponse, Request } from 'tsoa';
import ErrorResponseBuilder, { ErrorFormat, ErrorResponse } from '../../models/ErrorResponse';
import { Revision } from '../../models/Revision';
import { WikimediaSiteMatrix } from '../../util/WikimediaSiteMatrix';
import express from 'express';

/**
 *
 */
@Route( 'v1/revisions' )
export class MediaWikiRevisionController extends Controller {

	static readonly errorUnsupportedWiki = new ErrorResponseBuilder()
		.add( 'unsupportedwiki', {
			text: 'This wiki is not a supported Wikimedia wiki',
			key: 'apierror-unsupportedwiki'
		} );

	/**
	 * @param req Express request object
	 * @param wiki Database name of the wiki
	 * @param revisions Revision IDs to process, separated by pipes (`|`)
	 * @return Decorated revisions for Deput
	 */
	@Get( '{wiki}' )
	@Response<ErrorResponse>(
		422,
		'Unsupported wiki',
		MediaWikiRevisionController.errorUnsupportedWiki.build()
	)
	@SuccessResponse( 200, 'OK' )
	public async getRevision(
		@Request() req: express.Request,
		@Path() wiki: string,
		@Query() revisions: string
	): Promise<{ revisions: Revision[] } | ErrorResponse> {
		const site = await WikimediaSiteMatrix.i.getDbName( wiki );

		if ( !site || site.nonglobal !== undefined ) {
			this.setStatus( 422 );
			return MediaWikiRevisionController.errorUnsupportedWiki.build(
				req.params.errorformat as ErrorFormat
			);
		}

		return { revisions: [] };
	}

}
