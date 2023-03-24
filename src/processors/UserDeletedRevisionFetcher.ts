import { SiteMatrixSite } from '../util/WikimediaSiteMatrix';
import TitleFactory from '../util/Title';
import dbTimestamp from '../database/util/dbTimestamp';
import ReplicaConnection from '../database/ReplicaConnection';
import {
	ChangeDeletionFlags,
	RevisionDeletionInfo,
	PossibleDeletedRevision,
	ChangeDeletionBitmaskConstants,
	TextDeletedRevision
} from '../models/DeletedRevision';
import { MwnTitle } from 'mwn';
import type { Knex } from 'knex';
import { MwnTitleStatic } from 'mwn/build/title';
import dbString from '../database/util/dbString';
import DatabaseRevisionFetcher from './DatabaseRevisionFetcher';
import phpUnserialize from 'phpunserialize';

declare module 'phpunserialize' {
	// eslint-disable-next-line @typescript-eslint/no-shadow
	export default function phpUnserialize( str: string ): any;
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
	 * is not wiped from the revision_userindex table) because the revision must
	 * have a valid actor (which, in this case, is always true).
	 *
	 * THIS QUERY TAKES AROUND A MINUTE! When possible, break this into multiple
	 * queries and provide progress indicators.
	 *
	 * @param user
	 */
	async fetch( user: string ): Promise<TextDeletedRevision[]> {
		const conn = await ReplicaConnection.connect( this.site, this.type );
		const Title = await TitleFactory.get( this.site );
		const usernameTitle =
			new Title( user, Title.nameIdMap.user );

		const deletedRevs = await this.getUserDeletedRevisions( conn, Title, usernameTitle );
		return this.upgradeDeletedRevisions( conn, Title, deletedRevs );
	}

	/**
	 * Fetches deleted revisions by a user.
	 *
	 * We can assume in this case that the user is never `null` (i.e. the user
	 * is not wiped from the replica revision table) because the revision must
	 * have a valid actor (which, in this case, is always true).
	 *
	 * @param conn
	 * @param Title
	 * @param user The user to get
	 */
	async getUserDeletedRevisions( conn: Knex, Title: MwnTitleStatic, user: MwnTitle ):
		Promise<PossibleDeletedRevision[]> {
		return DatabaseRevisionFetcher.fetch(
			conn, Title, ( qb ) => qb
				.where( 'main.rev_actor', conn( 'actor_revision' )
					.select( 'actor_id' )
					.where( 'actor_name', user.getMain() )
				)
				.andWhere( 'main.rev_deleted', '>', 0 )
				.orderBy( 'main.rev_timestamp', 'desc' )
		);
	}

	/**
	 * Upgrades deleted revisions by locating the log entry which caused the
	 * deletion. For suppressed revisions, there is no way to determine this
	 * information (as it is scrubbed from the Wiki Replicas), so it is set
	 * to just `true`.
	 *
	 * @param conn
	 * @param Title
	 * @param revisions
	 */
	async upgradeDeletedRevisions(
		conn: Knex,
		Title: MwnTitleStatic,
		revisions: ( PossibleDeletedRevision )[]
	): Promise<TextDeletedRevision[]> {
		const revisionIds = revisions.map( r => r.revid );

		const foundLogEntries: RevisionDeletionInfo[] = await conn( 'logging_userindex' )
			.select( [
				'log_id',
				'log_timestamp',
				'log_params',
				conn.raw( `
					(
						SELECT GROUP_CONCAT(ctd_name SEPARATOR ",")
						FROM change_tag
						JOIN change_tag_def ON ctd_id = ct_tag_id
						WHERE ct_log_id = log_id
					) as ts_tags
				`.replace( /[\t\r\n]/g, ' ' ) )
			] )
			.withLogActor( [ 'actor_id', 'actor_name' ] )
			.withLogComment( [ 'comment_id', 'comment_text' ] )
			.where( 'log_type', 'delete' )
			.andWhere( 'log_action', 'revision' )
			.andWhere( ( qb ) => {
				let ref = qb;
				for ( const revId of revisionIds ) {
					ref = ref.orWhereRaw( `\`log_params\` LIKE "%i:${ revId };%"` );
				}
				return ref;
			} )
			.orderBy( 'log_timestamp', 'asc' )
			.then( entries => entries.map( this.logDeserialize.bind( this, Title ) ) );

		const entryIndex = {};
		const entryFirstFew = {};
		// Since the array iterates entries from oldest to newest, successive new matches
		// will be overwritten.
		for ( const entry of foundLogEntries ) {
			entry.params.ids.sort( ( a, b ) => a - b );
			const firstFew = entry.params.ids.slice( 0, 3 );
			for ( const id of entry.params.ids ) {
				entryIndex[ id ] = entry;
				entryFirstFew[ id ] = firstFew;
			}
		}

		return revisions.map( r => Object.assign( r, {
			texthidden: <const>true,
			deleted: entryIndex[ r.revid ] ?? true,
			islikelycause: entryIndex[ r.revid ] ?
				entryFirstFew[ r.revid ].includes( r.revid ) : false
		} ) );
	}

	/**
	 * Deserializes a database log entry into a TextDeletedRevision.
	 *
	 * @param Title
	 * @param logEntry
	 * @return The log entry in API:Query form.
	 * @see https://w.wiki/6QgW
	 */
	logDeserialize(
		Title: MwnTitleStatic,
		logEntry: Record<string, Buffer | number>
	): RevisionDeletionInfo {
		// Strip out the numeric internationalization keys from the param keys.
		const deserializedParameters: any = logEntry.log_params ? Object.fromEntries(
			Object.entries( phpUnserialize( dbString( logEntry.log_params as Buffer ) ) )
				.map( ( [ k, v ] ) => [ k.replace( /^\d+::/, '' ), v ] )
		) : null;

		const bitmaskToDeletionFlags = ( bitmask: number ): ChangeDeletionFlags => ( {
			bitmask: bitmask,
			// eslint-disable-next-line no-bitwise
			content: !!( bitmask & ChangeDeletionBitmaskConstants.DELETED_TEXT ),
			// eslint-disable-next-line no-bitwise
			comment: !!( bitmask & ChangeDeletionBitmaskConstants.DELETED_COMMENT ),
			// eslint-disable-next-line no-bitwise
			user: !!( bitmask & ChangeDeletionBitmaskConstants.DELETED_USER ),
			// eslint-disable-next-line no-bitwise
			restricted: !!( bitmask & ChangeDeletionBitmaskConstants.DELETED_RESTRICTED )
		} );

		const user = logEntry.actor_name ? new Title(
			dbString( logEntry.actor_name as Buffer ), Title.nameIdMap.user
		).getMainText() : null;
		return {
			logid: +logEntry.log_id,
			params: logEntry.log_params ? {
				type: deserializedParameters.type,
				ids: deserializedParameters.ids,
				old: bitmaskToDeletionFlags( deserializedParameters.ofield ),
				new: bitmaskToDeletionFlags( deserializedParameters.nfield )
			} : null,
			user: user,
			timestamp: logEntry.log_timestamp ?
				dbTimestamp( logEntry.log_timestamp as Buffer ).toISOString() : null,
			comment: dbString( logEntry.comment_text as Buffer ),
			tags: dbString( logEntry.comment_text as Buffer ).split( ',' ),

			// hidden flags
			...( logEntry.actor_id == null ? { userhidden: true } : {} ),
			...( logEntry.comment_id == null ? { commenthidden: true } : {} ),
			...( logEntry.log_params == null ? { actionhidden: true } : {} )
		};
	}
}
