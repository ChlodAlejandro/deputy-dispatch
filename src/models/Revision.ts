/**
 * Represents a MediaWiki revision pulled from the `query` API action.
 */
export interface RevisionData {
	/**
	 * The ID of the revision.
	 */
	revid: number,
	/**
	 * The revision that comes before this one.
	 */
	parentid: number,
	/**
	 * Whether this revision was marked as minor or not.
	 */
	minor: boolean,
	/**
	 * The name of the user who made the edit (may be a username or an IP address).
	 */
	user: string,
	/**
	 * The timestamp on which the edit was made.
	 */
	timestamp: string,
	/**
	 * The size of the revision in bytes.
	 */
	size: number,
	/**
	 * The summary left by the user for the revision.
	 */
	comment: string;
	/**
	 * The tags of this revision.
	 */
	tags: string[];
}

/**
 * Represents a MediaWiki revision that is missing. This may be because the revision
 * has been deleted, the page has been deleted (and the user cannot access deleted
 * pages), or the user otherwise does not have permission to view the revision.
 */
export interface MissingRevision {
	revid: number;
	missing?: true;
}

/**
 * Represents an expanded revision. The expanded revision data is added in by Dispatch
 * in order to pack more data within a revision. This data includes the name of the page,
 * the difference in bytes between the current and previous revision, and an HTML
 * rendering of the user-provided summary.
 */
export interface ExpandedRevision extends RevisionData {
	page: {
		pageid: number,
		ns: number,
		title: string,
	}
	diffsize: number,
	parsedcomment?: string
}

export type Revision = ExpandedRevision | MissingRevision;
