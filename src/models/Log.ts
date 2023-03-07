export interface LogEntry {
	logid: number,
	params: any,
	comment: string,
	user: string,
	timestamp: string,
	tags: string[],

	commenthidden?: boolean;
	actionhidden?: boolean;
	userhidden?: boolean;
}
