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
	TaskInformation
} from '../../abstract/AsyncTaskController';
import { ErrorResponse } from '../../../models/ErrorResponse';
import express from 'express';
import { SiteMatrixSite, WikimediaSiteMatrix } from '../../../util/WikimediaSiteMatrix';
import Cache from 'stale-lru-cache';
import UserTalkPageFetcher, { PageRevisions } from '../../../processors/UserTalkPageFetcher';
import { AsyncTask } from '../../abstract/AsyncTask';
import ErrorResponseBuilder from '../../../util/ErrorResponseBuilder';

type FilterType = string | string[] | { source: string, flags: string };

/**
 *
 */
@Tags( 'User' )
@Route( 'v1/user/search-talk' )
export class UserSearchTalk extends AsyncTaskController<
	{ site: SiteMatrixSite, user: string, filter: FilterType },
	PageRevisions
> {

	static readonly errorUnsupportedWiki = new ErrorResponseBuilder()
		.add( 'unsupportedwiki', {
			text: 'This wiki is not a supported Wikimedia wiki',
			key: 'apierror-unsupportedwiki'
		} );
	static readonly errorInvalidFilter = new ErrorResponseBuilder()
		.add( 'invalidfilter', {
			text: 'A filter provided in the request is invalid',
			key: 'apierror-invalidfilter'
		} );

	static readonly requestCache = new Cache<string, TaskInformation>( {
		maxSize: 100,
		maxAge: 3600 // 1 hour
	} );

	/**
	 * @inheritDoc
	 */
	protected getTaskListId(): string {
		return 'user-warnings';
	}

	/**
	 *
	 * @param options
	 * @param options.user
	 * @param options.site
	 * @param options.filter
	 * @param task
	 */
	async process(
		options: { site: SiteMatrixSite, user: string, filter: FilterType },
		task: AsyncTask<PageRevisions>
	): Promise<void> {
		await UserTalkPageFetcher.fetch(
			options.user,
			options.site,
			options.filter,
			task
		);
	}

	/**
	 * Search the talk page of a user for a given string.
	 *
	 * This will return an ID, which you are supposed to poll with
	 * `:id/progress` until the task is finished (in which case,
	 * you must get the final result on `:id`).
	 *
	 * @param req The request object
	 * @param bypassCache Whether to skip the cache or not
	 * @param user The username of the user
	 * @param wiki The wiki to query for
	 * @param filter
	 * @return Relevant task information
	 */
	@Post()
	@SuccessResponse( 202, 'Accepted' )
	public async searchUserTalkPage(
		@Request() req: express.Request,
		@Query() bypassCache: boolean = false,
		@BodyProp() user: string,
		@BodyProp() wiki: string,
		@BodyProp() filter: FilterType
	): Promise<TaskInformation | ErrorResponse> {
		const site = await WikimediaSiteMatrix.i.getDbName( wiki );
		if ( !site ) {
			this.setStatus( 400 );
			return UserSearchTalk.errorUnsupportedWiki.build();
		}
		if ( Array.isArray( filter ) ) {
			if ( filter.length > 0 ) {
				this.setStatus( 400 );
				return UserSearchTalk.errorInvalidFilter.build();
			}
		} else if ( typeof filter === 'object' ) {
			try {
				// eslint-disable-next-line no-new
				new RegExp( filter.source, filter.flags );
			} catch ( e ) {
				this.setStatus( 400 );
				return UserSearchTalk.errorInvalidFilter.build();
			}
		}

		const cacheKey = JSON.stringify( { user, wiki, filter } );
		if (
			UserSearchTalk.requestCache.has( cacheKey ) &&
			!UserSearchTalk.requestCache.isStale( cacheKey ) &&
			!bypassCache
		) {
			return this.handleProgressRequest(
				req, UserSearchTalk.requestCache.get( cacheKey ).id
			);
		}

		const task = this.runTask( { site, user, filter } );
		UserSearchTalk.requestCache.set( cacheKey, task );
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
	public async getUserWarningsResult(
		@Request() req: express.Request,
		@Path() id: string
	): Promise<PageRevisions | ErrorResponse> {
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
	public getUserWarningsProgress(
		@Request() req: express.Request,
		@Path() id: string
	): ErrorResponse | TaskInformation {
		return this.handleProgressRequest( req, id );
	}

}
