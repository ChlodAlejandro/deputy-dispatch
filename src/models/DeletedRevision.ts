import { PartialPartial } from '../util/PartialPartial';
import { ExpandedRevision } from './Revision';
import { LogEntry } from './Log';

/**
 * @see https://w.wiki/6PeZ RevisionRecord#DELETED_TEXT, related
 */
export enum ChangeDeletionBitmaskConstants {
	// Content hidden (most common case for copyright violations)
	DELETED_TEXT = 1,
	// Edit summary hidden
	DELETED_COMMENT = 2,
	// User hidden
	DELETED_USER = 4,
	// Suppressed edit (we're unlikely to hit it, but it's included here so
	// we can bail if we do)
	DELETED_RESTRICTED = 8,
}

export interface ChangeDeletionFlags {
	/**
	 * Bitmask for the deletion flags.
	 */
	bitmask: number;
	/**
	 * Whether the revision content was hidden.
	 */
	content: boolean,
	/**
	 * Whether the edit summary was hidden.
	 */
	comment: boolean,
	/**
	 * Whether the editing user was hidden.
	 */
	user: boolean,
	/**
	 * Whether the edit was suppressed.
	 */
	restricted: boolean
}

/**
 * Deletion log entry parameters
 */
export interface RevisionDeletionParams {
	/**
	 * The type of deletion in the log. In this case, it's always "revision".
	 */
	type: 'revision';
	/**
	 * The deleted revision IDs.
	 */
	ids: number[];
	/**
	 * The old deletion bitmask and flags
	 *
	 * If accurate flags cannot be determined, this may be null.
	 */
	old: ChangeDeletionFlags | null;
	/**
	 * The new deletion bitmask and flags
	 *
	 * If accurate flags cannot be determined, this may be null.
	 */
	new: ChangeDeletionFlags | null;
}

export interface RevisionDeletionInfo extends LogEntry {
	params: RevisionDeletionParams;
}

type DeletionInfoFlagged<T extends keyof ChangeDeletionFlags> = (
	Omit<RevisionDeletionInfo, 'flags'> & {
		flags: ChangeDeletionFlags & Record<T, true>
	}
)
export type PossibleDeletedRevision =
	Omit<PartialPartial<ExpandedRevision, 'user' | 'comment'>, 'parsedcomment'>;
export type UserDeletedRevision = PossibleDeletedRevision & {
	user: never,
	userhidden: true,
	deleted: true | DeletionInfoFlagged<'user'>
};
export type CommentDeletedRevision = PossibleDeletedRevision & {
	comment: never,
	parsedcomment: never,
	commenthidden: true,
	deleted: true | DeletionInfoFlagged<'comment'>
};
export type TextDeletedRevision = PossibleDeletedRevision & {
	islikelycause: boolean,
	texthidden: true,
	deleted: true | DeletionInfoFlagged<'content'>
};
/**
 * A modified version of {@link ExpandedRevision} that includes information about
 * what parts of the revision is deleted and for what reason.
 *
 * Note that `parsedcomment` is not included in the main revision because a comment
 * parser is not available when making SQL-based queries.
 */
export type DeletedRevision =
	UserDeletedRevision |
	CommentDeletedRevision |
	TextDeletedRevision;

/**
 * Checks if a revision is a {@link UserDeletedRevision}.
 *
 * @param rev The revision to check
 * @return `true` if the revision is a {@link UserDeletedRevision}, `false` otherwise.
 */
export function isRevisionUserHidden( rev: DeletedRevision ): rev is UserDeletedRevision {
	return !!( rev.user == null && ( rev as any ).userhidden && ( rev as any ).deleted.flags.user );
}

/**
 * Checks if a revision is a {@link CommentDeletedRevision}.
 *
 * @param rev The revision to check
 * @return `true` if the revision is a {@link CommentDeletedRevision}, `false` otherwise.
 */
export function isRevisionCommentHidden( rev: DeletedRevision ): rev is CommentDeletedRevision {
	return !!( rev.comment == null &&
		( rev as any ).commenthidden &&
		( rev as any ).deleted.flags.comment );
}

/**
 * Checks if a revision is a {@link TextDeletedRevision}.
 *
 * @param rev The revision to check
 * @return `true` if the revision is a {@link TextDeletedRevision}, `false` otherwise.
 */
export function isRevisionTextHidden( rev: DeletedRevision ): rev is TextDeletedRevision {
	return !!( ( rev as any ).texthidden && ( rev as any ).deleted.flags.text );
}
