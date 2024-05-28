import { Controller } from 'tsoa';
import { ErrorFormat, ErrorResponse } from '../../models/ErrorResponse';
import express from 'express';
import { AsyncTask } from './AsyncTask';
import Log from '../../util/Log';
import ErrorResponseBuilder from '../../util/ErrorResponseBuilder';

/**
 * Response type which returns the ID of a queued task and its progress.
 * Returned during polls.
 */
export interface TaskInformation {
	id: string;
	progress: number;
	finished: boolean;
}

/**
 * The AsyncTaskController helps in generating routes which queue a task
 * (with POST), poll for its status (with GET) and eventually requests
 * the finished product (with GET) when polling reports that the task is
 * complete. This allows asynchronous background tasks to be run without
 * holding a connection open (which would otherwise be killed by timeout).
 */
export default abstract class AsyncTaskController<O, R> extends Controller {

	static readonly missingTask = new ErrorResponseBuilder()
		.add( 'task-missing', {
			text: 'The requested task ID could not be found',
			key: 'apierror-task-missing'
		} );
	static readonly unfinishedTask = new ErrorResponseBuilder()
		.add( 'task-unfinished', {
			text: 'The requested task ID has not yet finished',
			key: 'apierror-task-unfinished'
		} );

	/**
	 * A list of tasks mapped by task UUIDs. The task may be an in-progress or
	 * completed AsyncTask, or an Error class, if the task execution experienced
	 * an uncaught promise rejection.
	 *
	 * @private
	 */
	private static taskLists = new Map<string, Map<string, AsyncTask<any> | Error>>();

	/**
	 * @protected
	 * @return the task list ID for this controller. Must be unique per route controller.
	 */
	protected abstract getTaskListId(): string;

	/**
	 * @return the tasks list for this asynchronous task controller.
	 */
	private get tasks(): Map<string, AsyncTask<R> | Error> {
		const tli = this.getTaskListId();
		if ( !AsyncTaskController.taskLists.has( tli ) ) {
			AsyncTaskController.taskLists.set( tli, new Map() );
		}
		return AsyncTaskController.taskLists.get( tli );
	}
	/**
	 * Run a task with the given options.
	 *
	 * @param options Options to run the task with.
	 * @return The ID of the task
	 */
	runTask( options: O ): AsyncTask<R> {
		const task = new AsyncTask<R>();
		this.tasks.set( task.id, task );
		this.process( options, task )
			.catch( ( e ) => {
				Log.error( `Error occurred while completing task ${task.id}.` );
				Log.error( task );
				if ( e instanceof Error ) {
					this.tasks.set( task.id, e );
				} else {
					this.tasks.set( task.id, new Error( String( e ) ) );
				}
			} );
		return task;
	}

	/**
	 * The processing function for this task. This task is provided an AsyncTask,
	 * which it must update throughout its execution. Failing to update the
	 * attached task tracker will cause the task to remain in limbo forever.
	 *
	 * @param options The options to run the task with
	 * @param task The task tracker
	 * @protected
	 */
	protected abstract process( options: O, task: AsyncTask<R> ): Promise<void>;

	/**
	 * Clean out expired tasks.
	 */
	sweepTasks(): void {
		for ( const [ id, task ] of this.tasks.entries() ) {
			if ( task instanceof Error || Date.now() - task.expireTime > 0 ) {
				this.tasks.delete( id );
			}
		}
	}

	/**
	 * Remove a specific task from the internal map.
	 *
	 * @param id The ID of the task to sweep
	 * @param checks Whether checks should be performed beforehand. This avoids sweeping
	 *   tasks which are not yet expiring.
	 */
	sweepTask( id: string, checks: boolean = false ) {
		if ( this.isTaskExisting( id ) ) {
			if ( !checks || this.isTaskExpired( id ) ) {
				this.tasks.delete( id );
			}
		}
	}

	/**
	 * Check if a given task exists
	 *
	 * @param id The ID of the task
	 * @return If the task exists
	 */
	isTaskExisting( id: string ): boolean {
		return this.tasks.has( id );
	}

	/**
	 * Check if a task has expired.
	 *
	 * @param id The ID of the task
	 * @return If the task has expired
	 */
	isTaskExpired( id: string ): boolean {
		const task = this.tasks.get( id );
		return task instanceof Error ? true : Date.now() - task.expireTime > 0;
	}

	/**
	 * Get the progress of the task.
	 *
	 * @param id
	 * @return The current progress, from 0 to 1.
	 */
	getTaskProgress( id: string ): number {
		const task = this.tasks.get( id );
		return task instanceof Error ? 1 : task.progress;
	}

	/**
	 * Get the finished status of the task.
	 *
	 * @param id
	 * @return If the task is finished
	 */
	getTaskFinished( id: string ): boolean {
		const task = this.tasks.get( id );
		return task instanceof Error ? true : task.finished;
	}

	/**
	 * Get the result of the task.
	 *
	 * @param id
	 * @return The task result
	 */
	getTaskResult( id: string ): R {
		const task = this.tasks.get( id );
		return task instanceof Error ? null : task.result;
	}

	/**
	 * Handles progress requests. Handles two cases:
	 * - `POST /`
	 * - `GET /:id/progress`
	 *
	 * @param req The request object
	 * @param id The ID of the task
	 * @return Task information
	 */
	handleProgressRequest( req: express.Request, id: string ): TaskInformation|ErrorResponse {
		if ( !this.isTaskExisting( id ) ) {
			this.setStatus( 404 );
			return AsyncTaskController.missingTask.build(
				req.params.errorformat as ErrorFormat
			);
		}
		const finished = this.getTaskFinished( id );
		if ( finished ) {
			this.setHeader( 'Location', '..' );
		}
		return {
			id,
			progress: this.getTaskProgress( id ),
			finished: finished
		};
	}

	/**
	 * Handles result requests. Only handles the result GET request (`GET /:id`).
	 *
	 * @param req The request object
	 * @param id The ID of the task
	 * @return The result of the task, an error otherwise
	 */
	handleResultRequest( req: express.Request, id: string ): R|ErrorResponse {
		if ( !this.isTaskExisting( id ) ) {
			this.setStatus( 404 );
			return AsyncTaskController.missingTask.build(
				req.params.errorformat as ErrorFormat
			);
		}
		const task = this.tasks.get( id );
		if ( task instanceof Error ) {
			this.setStatus( 500 );
			return new ErrorResponseBuilder()
				.add( 'task-uncaught-generic', {
					text: 'Uncaught error: ' + task.message,
					key: 'apierror-task-uncaught-generic'
				} ).build();
		} else if ( !task.finished ) {
			this.setStatus( 409 );
			return AsyncTaskController.unfinishedTask.build(
				req.params.errorformat as ErrorFormat
			);
		}
		return this.getTaskResult( id );
	}

}
