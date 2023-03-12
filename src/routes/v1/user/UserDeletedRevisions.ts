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
import { DeletedRevision, TextDeletedRevision } from '../../../models/DeletedRevision';
import UserDeletedRevisionFetcher from '../../../processors/UserDeletedRevisionFetcher';
import { SiteMatrixSite, WikimediaSiteMatrix } from '../../../util/WikimediaSiteMatrix';
import ReplicaConnection from '../../../database/ReplicaConnection';
import TitleFactory from '../../../util/Title';
import Cache from 'stale-lru-cache';

interface UserDeletedRevisionsResponse {
	revisions: Record<number, DeletedRevision>;
}

/**
 *
 */
@Tags( 'User' )
@Route( 'v1/user/deleted-revisions' )
export class UserDeletedRevisions
	extends AsyncTaskController<{ site: SiteMatrixSite, user: string },
		UserDeletedRevisionsResponse> {

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
		return 'user-deleted-revisions';
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
		task: AsyncTask<UserDeletedRevisionsResponse>
	): Promise<void> {
		const udrf = new UserDeletedRevisionFetcher( options.site, 'web' );
		const conn = await ReplicaConnection.connect( options.site, 'web' );
		const Title = await TitleFactory.get( options.site );
		const usernameTitle =
			new Title( options.user, Title.nameIdMap.user );

		task.updateProgress( 0 );
		const deletedRevsQueryStart = Date.now();
		const deletedRevs = await udrf.getUserDeletedRevisions( conn, Title, usernameTitle );
		const deletedRevsQueryDuration = Date.now() - deletedRevsQueryStart;

		// Mark as 1/5 done.
		task.updateProgress( 0.20 );

		const upgradeBatchSize = 25;
		const upgradeBatchCount = deletedRevs.length / upgradeBatchSize;
		const upgradeStart = Date.now();
		let upgradeDuration = null;
		for ( let i = 0; i < Math.ceil( upgradeBatchCount ); i++ ) {
			const batch = deletedRevs.slice( i * upgradeBatchSize, ( i + 1 ) * upgradeBatchSize );
			await udrf.upgradeDeletedRevisions( conn, Title, batch );
			if ( upgradeDuration == null ) {
				upgradeDuration = Date.now() - upgradeStart;
			}
			// Set a minimum of 20% to avoid back-tracking the progress bar.
			task.updateProgress( Math.max(
				( deletedRevsQueryDuration + ( upgradeDuration * ( i + 1 ) ) ) /
				( deletedRevsQueryDuration + ( upgradeBatchCount * upgradeDuration ) ),
				0.20
			) );
		}

		// All batches done!
		task.finish( {
			revisions: deletedRevs as TextDeletedRevision[]
		} );
	}

	/**
	 * Search for all deleted edits by a user and determine their reasons.
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
	public async getUserDeletedRevisions(
		@Request() req: express.Request,
		@Query() bypassCache: boolean = false,
		@BodyProp() user: string,
		@BodyProp() wiki: string
	): Promise<TaskInformation | ErrorResponse> {
		const site = await WikimediaSiteMatrix.i.getDbName( wiki );
		if ( !site ) {
			this.setStatus( 400 );
			return UserDeletedRevisions.errorUnsupportedWiki.build();
		}

		const cacheKey = JSON.stringify( { user, wiki } );
		if (
			UserDeletedRevisions.requestCache.has( cacheKey ) &&
			!UserDeletedRevisions.requestCache.isStale( cacheKey ) &&
			!bypassCache
		) {
			return this.handleProgressRequest(
				req, UserDeletedRevisions.requestCache.get( cacheKey ).id
			);
		}

		const task = this.runTask( { site, user } );
		UserDeletedRevisions.requestCache.set( cacheKey, task );
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
	public async getUserDeletedRevisionsResult(
		@Request() req: express.Request,
		@Path() id: string
	): Promise<ErrorResponse | UserDeletedRevisionsResponse> {
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
	public getUserDeletedRevisionsProgress(
		@Request() req: express.Request,
		@Path() id: string
	): ErrorResponse | TaskInformation {
		return this.handleProgressRequest( req, id );
	}

}
