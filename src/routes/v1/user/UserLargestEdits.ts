import {
	BodyProp,
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
	AsyncTask,
	TaskInformation
} from '../../abstract/AsyncTaskController';
import ErrorResponseBuilder, { ErrorResponse } from '../../../models/ErrorResponse';
import express from 'express';
import { SiteMatrixSite, WikimediaSiteMatrix } from '../../../util/WikimediaSiteMatrix';
import Cache from 'stale-lru-cache';
import UserDeletedPageFetcher, { DeletedPage } from '../../../processors/UserDeletedPageFetcher';

interface UserDeletedPagesResponse {
	pages: Record<number, DeletedPage>;
}

/**
 *
 */
@Tags( 'User' )
@Route( 'v1/user/largest-edits' )
export class UserLargestEdits
	extends AsyncTaskController<{ site: SiteMatrixSite, user: string },
		UserDeletedPagesResponse> {

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
		return 'user-deleted-pages';
	}

	/**
	 *
	 * @param options
	 * @param options.user
	 * @param options.site
	 * @param task
	 */
	async process(
		options: { site: SiteMatrixSite, user: string },
		task: AsyncTask<UserDeletedPagesResponse>
	): Promise<void> {
		const udrf = new UserDeletedPageFetcher( options.site, 'web' );
		task.finish( { pages: await udrf.fetch( options.user ) } );
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
	 * @param user The username of the user
	 * @param wiki The wiki to query for
	 * @return Relevant task information
	 */
	@Post()
	@SuccessResponse( 202, 'Accepted' )
	public async getUserDeletedPages(
		@Request() req: express.Request,
		@Query() bypassCache: boolean = false,
		@BodyProp() user: string,
		@BodyProp() wiki: string
	): Promise<TaskInformation | ErrorResponse> {
		const site = await WikimediaSiteMatrix.i.getDbName( wiki );
		if ( !site ) {
			this.setStatus( 400 );
			return UserLargestEdits.errorUnsupportedWiki.build();
		}

		const cacheKey = JSON.stringify( { user, wiki } );
		if (
			UserLargestEdits.requestCache.has( cacheKey ) &&
			!UserLargestEdits.requestCache.isStale( cacheKey ) &&
			!bypassCache
		) {
			return this.handleProgressRequest(
				req, UserLargestEdits.requestCache.get( cacheKey ).id
			);
		}

		const task = this.runTask( { site, user } );
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
	public async getUserDeletedPagesResult(
		@Request() req: express.Request,
		@Path() id: string
	): Promise<ErrorResponse | UserDeletedPagesResponse> {
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
	public getUserDeletedPagesProgress(
		@Request() req: express.Request,
		@Path() id: string
	): ErrorResponse | TaskInformation {
		return this.handleProgressRequest( req, id );
	}

}
