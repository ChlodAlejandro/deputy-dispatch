import knex, { Knex } from 'knex';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import ini from 'ini';
import attachRevisionQueryBuilderExtensions from './extensions/RevisionQueryBuilder';
import attachLogQueryBuilderExtensions from './extensions/LoggingQueryBuilder';
import Log from '../util/Log';
import { ROOT_PATH, TOOLFORGE } from '../DispatchConstants';
import attachArchiveQueryBuilderExtensions from './extensions/ArchiveQueryBuilder';

/**
 * Toolforge database connection handler.
 *
 * This handler MUST be compliant with the connection
 * handling policy! See https://w.wiki/6PUf for details
 */
export default class DatabaseConnection {

	private static DB_USER:string;
	private static DB_PASS: string;
	/**
	 * @return whether database connections can be made.
	 */
	public static get ENABLED(): boolean {
		return !!DatabaseConnection.DB_USER &&
			!!DatabaseConnection.DB_PASS;
	}

	/**
	 * Verify environment variables and data.
	 */
	static async verifyEnvironment(): Promise<void> {
		DatabaseConnection.DB_USER =
			process.env.DISPATCH_TOOLSDB_USER || process.env.USER;
		DatabaseConnection.DB_PASS =
			process.env.DISPATCH_TOOLSDB_PASS || process.env.MYSQL_PWD;
		if ( !DatabaseConnection.DB_USER || !DatabaseConnection.DB_PASS ) {
			// Data incomplete, do file reads
			await this.readMyCnf( [
				path.resolve( os.homedir(), '.replica.my.cnf' ),
				path.resolve( ROOT_PATH, 'replica.my.cnf' )
			] );
		}

		if ( !DatabaseConnection.ENABLED ) {
			Log.error( 'No database credentials found. DB assertions will fail!' );
			Log.info( 'This includes many API endpoints that rely on the DB.' );
			Log.info( 'Provide an SQL user/password or a valid replica.my.cnf.' );
			Log.info( 'See the README for more information.' );
		}

		try {
			attachRevisionQueryBuilderExtensions();
			attachArchiveQueryBuilderExtensions();
			attachLogQueryBuilderExtensions();
		} catch ( e ) {
			Log.error(
				'Failed to attach Knex QueryBuilder extensions. Queries will fail!'
			);
		}
	}

	/**
	 * Read configuration values from the replica.my.cnf file.
	 *
	 * @param paths A list of paths to the replica.my.cnf file.
	 */
	static async readMyCnf( paths: string[] ): Promise<void> {
		for ( const confPath of paths ) {
			if ( !!DatabaseConnection.DB_USER && !!DatabaseConnection.DB_PASS ) {
				return;
			}

			try {
				const confFile = await fs.readFile( confPath, 'utf8' );
				const conf = ini.parse( confFile );

				Log.debug( `Found replica.my.cnf: ${ confPath }` );

				if ( !DatabaseConnection.DB_USER ) {
					DatabaseConnection.DB_USER = conf.client.user;
				}
				if ( !DatabaseConnection.DB_PASS ) {
					DatabaseConnection.DB_PASS = conf.client.password;
				}
			} catch ( e ) {
				if ( e.code !== 'ENOENT' ) {
					Log.debug( `Failed to read replica.my.cnf: ${e}` );
					Log.debug( 'Trying another path...' );
				}
			}
		}
		if ( !DatabaseConnection.DB_USER || !DatabaseConnection.DB_PASS ) {
			Log.error( 'Failed to read any valid replica.my.cnf!' );
		}
	}

	/**
	 * Opens a new connection on a Toolforge database. This may be a
	 * replica (see {@link ReplicaConnection}) or a ToolsDB database.
	 *
	 * @param host
	 * @param port
	 * @param database
	 */
	protected static async open(
		host: string,
		port: number,
		database: string
	): Promise<Knex> {
		// Under the super rare circumstance that someone finds an ACE exploit and
		// attempts to steal the credentials by connecting to an outside database.
		if ( TOOLFORGE && !host.endsWith( 'db.svc.wikimedia.cloud' ) ) {
			throw new Error( 'Attempted to connect to non-Wikimedia database.' );
		}

		return knex( {
			client: 'mysql2',
			connection: {
				host,
				port,
				user: DatabaseConnection.DB_USER,
				password: DatabaseConnection.DB_PASS,
				database
			},
			// Prevent idle connections per policy
			pool: {
				min: 0,
				idleTimeoutMillis: 5e3
			}
		} );
	}

}
