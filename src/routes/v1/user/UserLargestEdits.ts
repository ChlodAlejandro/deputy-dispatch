import {
	Body,
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
import AsyncTaskController, {
	TaskInformation
} from '../../abstract/AsyncTaskController';
import ErrorResponseBuilder, { ErrorResponse } from '../../../models/ErrorResponse';
import express from 'express';
import { SiteMatrixSite, WikimediaSiteMatrix } from '../../../util/WikimediaSiteMatrix';
import Cache from 'stale-lru-cache';
import { ExpandedRevision } from '../../../models/Revision';
import DatabaseRevisionFetcher from '../../../processors/DatabaseRevisionFetcher';
import TitleFactory from '../../../util/Title';
import ReplicaConnection from '../../../database/ReplicaConnection';
import { AsyncTask } from '../../abstract/AsyncTask';

interface UserLargestEditsResponse {
	revisions: Omit<ExpandedRevision, 'parsedcomment'>[];
}

interface UserLargestEditsConfiguration {
	site: SiteMatrixSite;
	user: string;
	offset?: number;
	namespaces?: number[];
	withReverts?: boolean;
	withoutTags?: string[];
}

type UserLargestEditsBody = Omit<UserLargestEditsConfiguration, 'site'> & {
	wiki: string;
}

/**
 *
 */
@Tags( 'User' )
@Route( 'v1/user/largest-edits' )
export class UserLargestEdits
	extends AsyncTaskController<UserLargestEditsConfiguration, UserLargestEditsResponse> {

	static readonly errorUnsupportedWiki = new ErrorResponseBuilder()
		.add( 'unsupportedwiki', {
			text: 'This wiki is not a supported Wikimedia wiki',
			key: 'apierror-unsupportedwiki'
		} );

	static readonly requestCache = new Cache<string, TaskInformation>( {
		maxSize: 100,
		maxAge: 3600 // 1 hour
	} );

	/**
	 * @inheritDoc
	 */
	protected getTaskListId(): string {
		return 'user-largest-edits';
	}

	/**
	 *
	 * @param options
	 * @param task
	 */
	async process(
		options: UserLargestEditsConfiguration,
		task: AsyncTask<UserLargestEditsResponse>
	): Promise<void> {
		const conn = await ReplicaConnection.connect( options.site, 'web' );
		const Title = await TitleFactory.get( options.site );
		const user = new Title( options.user, 2 );

		// Get the revisions
		const drf = await DatabaseRevisionFetcher.fetch( conn, Title, ( qb ) => {
			qb
				.select( {
					diff: conn.raw(
						'(CAST(main.rev_len AS SIGNED) - CAST(parent.rev_len AS SIGNED))'
					)
				} )
				.where( 'main.rev_actor', conn( 'actor_revision' )
					.select( 'actor_id' )
					.where( 'actor_name', user.getMain() )
				)
				.orderBy( 'diff', 'desc' );

			if ( options.namespaces ) {
				qb.where( 'page_namespace', 'in', options.namespaces );
			}
			if ( !options.withReverts ) {
				qb.withoutTags( [
					'mw-rollback', 'mw-undo', 'mw-manual-revert'
				], 'main' );
			}
			if ( options.withoutTags ) {
				qb.withoutTags( options.withoutTags, 'main' );
			}

			return qb
				.limit( 50 )
				.offset( options.offset ?? 0 );
		} );
		task.updateProgress( 0.5 );

		await DatabaseRevisionFetcher.upgradeRevisionsWithParsedEditSummaries( options.site, drf );
		task.finish( { revisions: drf } );
	}

	/**
	 * Search for all deleted pages by a user and determine their reasons.
	 *
	 * This will return an ID, which you are supposed to poll with
	 * `:id/progress` until the task is finished (in which case,
	 * you must get the final result on `:id`).
	 *
	 * @param req The request object
	 * @param bypassCache Whether to skip the cache or not
	 * @param config
	 * @return Relevant task information
	 */
	@Post()
	@SuccessResponse( 202, 'Accepted' )
	public async getUserLargestEdits(
		@Request() req: express.Request,
		@Query() bypassCache: boolean = false,
		@Body() config: UserLargestEditsBody
	): Promise<TaskInformation | ErrorResponse> {
		const site = await WikimediaSiteMatrix.i.getDbName( config.wiki );
		if ( !site ) {
			this.setStatus( 400 );
			return UserLargestEdits.errorUnsupportedWiki.build();
		}

		const cacheKey = JSON.stringify( config );
		if (
			UserLargestEdits.requestCache.has( cacheKey ) &&
			!UserLargestEdits.requestCache.isStale( cacheKey ) &&
			!bypassCache
		) {
			return this.handleProgressRequest(
				req, UserLargestEdits.requestCache.get( cacheKey ).id
			);
		}

		const task = this.runTask( Object.assign( {}, config, { site } ) );
		UserLargestEdits.requestCache.set( cacheKey, task );
		this.setStatus( 202 );
		this.setHeader( 'Location', `${ task.id }/progress` );
		return this.handleProgressRequest( req, task.id ) as TaskInformation;
	}

	/**
	 * Get the result of a previously-requested task. The task ID must be
	 * provided and it must be a valid task.
	 *
	 * @param req The request object
	 * @param id The ID of the task being queried
	 */
	@Get( '{id}' )
	@Response<ErrorResponse>(
		404,
		'Task ID not found',
		ErrorResponseBuilder.generic.build()
	)
	@Response<ErrorResponse>(
		409,
		'Task not yet finished',
		ErrorResponseBuilder.generic.build()
	)
	@SuccessResponse( 200, 'OK' )
	public async getUserLargestEditsResult(
		@Request() req: express.Request,
		@Path() id: string
	): Promise<UserLargestEditsResponse | ErrorResponse> {
		return this.handleResultRequest( req, id );
	}
	/**
	 * Gets the progress of a previously-requested task. The task ID must be
	 * provided and it must be a valid task.
	 *
	 * @param req The request object
	 * @param id The ID of the task being polled
	 * @return Relevant task information
	 */
	@Get( '{id}/progress' )
	@Response<ErrorResponse>(
		404,
		'Task ID not found',
		ErrorResponseBuilder.generic.build()
	)
	@SuccessResponse( 200, 'OK' )
	public getUserLargestEditsProgress(
		@Request() req: express.Request,
		@Path() id: string
	): ErrorResponse | TaskInformation {
		return this.handleProgressRequest( req, id );
	}

}
