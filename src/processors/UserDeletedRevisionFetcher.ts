import { PartialPartial } from '../util/PartialPartial';
import { ExpandedRevision } from '../models/Revision';
import { SiteMatrixSite } from '../util/WikimediaSiteMatrix';
import DatabaseRevisionFetcher from './DatabaseRevisionFetcher';
import TitleFactory from '../util/Title';
import dbTimestamp from '../util/func/dbTimestamp';

/**
 * @see https://w.wiki/6PeZ RevisionRecord#DELETED_TEXT, related
 */
export enum RevisionRecordDeletionConstants {
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

export interface DeletionFlags {
	/**
	 * Whether the revision content was hidden.
	 */
	text: boolean,
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

export interface DeletionInfo {
	flags: DeletionFlags,
	comment: string,
	parsedcomment: string,
	timestamp: string,
	user: string
}

type DeletionInfoFlagged<T extends keyof DeletionFlags> = ( Omit<DeletionInfo, 'flags'> & {
	flags: DeletionFlags & Record<T, true>
} )

type PossibleDeletedRevision =
	Omit<PartialPartial<ExpandedRevision, 'user' | 'comment'>, 'parsedcomment'>;

export type UserDeletedRevision = PossibleDeletedRevision & {
	user: never,
	userhidden: true
} & {
	deleted: true | DeletionInfoFlagged<'user'>
};
export type CommentDeletedRevision = PossibleDeletedRevision & {
	comment: never,
	parsedcomment: never,
	commenthidden: true
} & {
	deleted: true | DeletionInfoFlagged<'comment'>
};
export type TextDeletedRevision = PossibleDeletedRevision & {
	texthidden: true
} & {
	deleted: true | DeletionInfoFlagged<'text'>
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

/**
 *
 */
export default class UserDeletedRevisionFetcher {

	/**
	 * Creates a new DatabaseRevisionFetcher object
	 *
	 * @param site The site to run queries on
	 * @param type Which Replica to use (web = interactive, analytics = less load)
	 */
	constructor(
		readonly site: SiteMatrixSite,
		readonly type: 'analytics' | 'web'
	) {
	}

	/**
	 * Fetches deleted revisions by a user.
	 *
	 * We can assume in this case that the user is never `null` (i.e. the user
	 * is not wiped from the replica revision table) because the revision must
	 * have a valid actor (which, in this case, is always true).
	 *
	 * @param user
	 */
	async fetch( user: string ) {
		const drf = new DatabaseRevisionFetcher( this.site, this.type );
		const Title = await TitleFactory.get( this.site );
		const normalizedUsername =
			new Title( user, Title.nameIdMap.user ).getPrefixedText();

		drf.fetch( ( qb, conn ) => qb
			.where( 'main.rev_actor', conn( 'actor_revision' )
				.select( 'actor_id' )
				.where( 'actor_name', normalizedUsername )
			)
			.andWhere( 'main.rev_deleted', '>', 0 )
		)
			.then( d => Promise.all( d.map( async v => ( {
				revid: +v.rev_id,
				parentid: +v.rev_parent_id,
				minor: !!v.rev_minor_edit,
				user: normalizedUsername,
				timestamp: dbTimestamp( v.rev_timestamp ).toISOString(),
				size: v.rev_len,
				comment: v.comment_text ? v.comment_text.toString( 'utf8' ) : '',
				page: {
					id: +v.page_id,
					title: Title.makeTitle(
						+v.page_namespace, v.page_title.toString( 'utf8' )
					).getPrefixedText(),
					ns: +v.page_namespace
				},
				diffsize: v.rev_len - v.rev_parent_len
			} ) ) ) )
			.then( console.log );
	}

}
