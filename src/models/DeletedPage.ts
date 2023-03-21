import { LogEntry } from './Log';

export interface PageDeletionInfo extends LogEntry {
	params: any;

	guessed: boolean;
}

export interface DeletedPage {
	pageid: number | null;
	ns: number;
	title: string;
	created: string;
	length: number;

	/**
	 * A log entry describing the deletion. If the log entry could not be found,
	 * either due to the deletion's age or ambiguity, this will be `true`.
	 */
	deleted: true | PageDeletionInfo;
}
