import { BodyProp, Get, Path, Post, Request, Response, Route, SuccessResponse, Tags } from 'tsoa';
import AsyncTaskController, {
	AsyncTask,
	TaskInformation
} from '../../abstract/AsyncTaskController';
import ErrorResponseBuilder, { ErrorResponse } from '../../../models/ErrorResponse';
import express from 'express';
import Dispatch from '../../../Dispatch';
import { DeletedRevision } from '../../../processors/UserDeletedRevisionFetcher';

interface UserDeletedRevisionsResponse {
	revisions: Record<number, DeletedRevision>;
}

/**
 *
 */
@Tags( 'User' )
@Route( 'v1/user/deleted-revisions' )
export class UserDeletedRevisions
	extends AsyncTaskController<{ user: string }, UserDeletedRevisionsResponse> {

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
	 * @param task
	 */
	async process(
		options: { user: string },
		task: AsyncTask<UserDeletedRevisionsResponse>
	): Promise<void> {
		// eslint-disable-next-line prefer-const
		let x;
		const runTask = () => {
			task.updateProgress( task.progress + ( 1 / 60 ) );
			Dispatch.i.log.trace( 'PROGRESS: ' + task.progress );

			if ( task.progress >= 1 ) {
				task.finish( null );
				clearInterval( x );
			}
		};

		x = setInterval( runTask, 1000 );
	}

	/**
	 * Search for all deleted edits by a user and determine their reasons.
	 *
	 * This will return an ID, which you are supposed to poll with
	 * `:id/progress` until the task is finished (in which case,
	 * you must get the final result on `:id`).
	 *
	 * @param req The request object
	 * @param user The username of the user
	 * @return Relevant task information
	 */
	@Post()
	@SuccessResponse( 202, 'Accepted' )
	public run(
		@Request() req: express.Request,
		@BodyProp() user: string
	): TaskInformation {
		const task = this.runTask( { user } );
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
	public async result(
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
	public progress(
		@Request() req: express.Request,
		@Path() id: string
	): ErrorResponse | TaskInformation {
		return this.handleProgressRequest( req, id );
	}

}
