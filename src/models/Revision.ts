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
	 *
	 * If the user is not visible (due to suppression or deletion), `null` is used.
	 */
	user: string | null,
	/**
	 * The timestamp on which the edit was made.
	 */
	timestamp: string,
	/**
	 * The size of the revision in bytes.
	 */
	size: number | null,
	/**
	 * The summary left by the user for the revision.
	 *
	 * If the comment is not visible (due to suppression or deletion), `null` is used.
	 */
	comment: string;
	/**
	 * The tags of this revision.
	 */
	tags: string[];
	/**
	 * Whether certain parts of this revision is not visible to users.
	 */
	visibility?: {
		/**
		 * Whether the comment left by the user is not visible.
		 */
		comment: boolean,
		/**
		 * Whether the text of the edit is not visible.
		 */
		text: boolean,
		/**
		 * Whether the user who made the edit is not visible.
		 */
		user: boolean
	};

	// Flags for revision deletion
	/**
	 * `true` if the comment for this revision is hidden.
	 */
	commenthidden?: boolean;
	/**
	 * `true` if the user for this revision is hidden.
	 */
	userhidden?: boolean;
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
 * Represents a MediaWiki revision that is invalid. This is almost always a malformed
 * revision ID, which is either some string that isn't a proper number, or a negative
 * number.
 */
export interface InvalidRevision {
	revid: number;
	invalid?: true;
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

/**
 * @return `true` if a revision is missing.
 * @param revision
 */
export function isMissingRevision( revision: Revision ): revision is InvalidRevision {
	return !!( revision as any ).missing;
}

/**
 * @return `true` if a revision is invalid.
 * @param revision
 */
export function isInvalidRevision( revision: Revision ): revision is MissingRevision {
	return !!( revision as any ).invalid;
}

/**
 * @return `true` if a revision is valid and not missing.
 * @param revision
 */
export function isValidRevision( revision: Revision ): revision is ExpandedRevision {
	return !isMissingRevision( revision ) && !isInvalidRevision( revision );
}

export type Revision =
	| ExpandedRevision
	| MissingRevision
	| InvalidRevision;
