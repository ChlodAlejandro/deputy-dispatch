import crypto from 'crypto';
import Log from '../../util/Log';

/**
 * An asynchronous task that is currently running. It can be used to set
 * the task progress within the async task, and to indicate when a result
 * has been generated.
 */
export class AsyncTask<R> {

	// Task data expires after 1 hour.
	static readonly TASK_EXPIRE_TIME = 3600e3;

	id: string = crypto.randomUUID();
	finished: boolean = false;
	progress: number = 0;
	expireTime: number = Date.now() + AsyncTask.TASK_EXPIRE_TIME;
	result: R;

	/**
	 * Update the progress of this task.
	 *
	 * @param progress The task's current progress. Must be within 0 and 1.
	 */
	updateProgress( progress: number ) {
		this.progress = Math.max( 0, Math.min( 1, progress ) );
		Log.trace( `${ ( this.progress * 100 ).toFixed( 2 ) }% done.`, {
			task: this.id
		} );
	}

	/**
	 * Mark this task as finished and set the result.
	 *
	 * @param result
	 */
	finish( result: R ) {
		this.progress = 1;
		this.result = result;
		this.finished = true;
		Log.trace( 'Finished.', {
			task: this.id
		} );
	}

}
