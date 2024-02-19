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

	/**
	 * Verify environment variables and data.
	 */
	static async verifyEnvironment(): Promise<void> {
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
	 * @return An object containing the `user` and `password` for database connection.
	 */
	static async readMyCnf( paths: string[] ): Promise<{ user: string, password: string }> {
		let user: string,
			password: string;
		for ( const confPath of paths ) {
			try {
				// Low-risk file read, file path is constant.
				// eslint-disable-next-line security/detect-non-literal-fs-filename
				const confFile = await fs.readFile( confPath, 'utf8' );
				const conf = ini.parse( confFile );

				Log.debug( `Found replica.my.cnf: ${ confPath }` );

				if ( !user ) {
					user = conf.client.user;
				}
				if ( !password ) {
					password = conf.client.password;
				}
			} catch ( e ) {
				if ( e.code !== 'ENOENT' ) {
					Log.debug( `Failed to read replica.my.cnf: ${e}` );
					Log.debug( 'Trying another path...' );
				}
			}
		}
		if ( !user || !password ) {
			Log.error( 'Failed to read any valid replica.my.cnf!' );
		}

		return { user, password };
	}

	/**
	 * Get the database credentials. Database credentials are detected in
	 * the following order:
	 *  - From the `DISPATCH_TOOLSDB_USER` and `DISPATCH_TOOLSDB_PASS` environment variables
	 *  - From the `USER` and `MYSQL_PWD` environment variables
	 *  - If on Toolforge, from the `TOOL_TOOLSDB_USER` and `TOOL_TOOLSDB_PASSWORD`
	 *    environment variables (available in Build Service)
	 *  - If on Toolforge, from the `.replica.my.cnf` file in the `$TOOL_DATA_DIR`
	 *    directory (available in Build Service)
	 *  - If on Toolforge, from the `.replica.my.cnf` file in the home directory
	 *    (available in Kubernetes runners)
	 *  - From the `replica.my.cnf` file in the root directory
	 *
	 * @param forReplicas
	 * @return An object containing the `user` and `password` for database connection.
	 */
	protected static async getCredentials(
		forReplicas = false
	): Promise<{ user: string, password: string }> {
		let user =
			process.env.DISPATCH_TOOLSDB_USER || process.env.USER;
		let password =
			process.env.DISPATCH_TOOLSDB_PASS || process.env.MYSQL_PWD;

		if ( TOOLFORGE && forReplicas ) {
			user = process.env.TOOL_REPLICA_USER;
			password = process.env.TOOL_REPLICA_PASSWORD;
		} else if ( TOOLFORGE && !forReplicas ) {
			user = process.env.TOOL_TOOLSDB_USER;
			password = process.env.TOOL_TOOLSDB_PASSWORD;
		}

		if ( !user || !password ) {
			// Data incomplete, do file reads
			const searchPaths = [
				path.resolve( ROOT_PATH, '.replica.my.cnf' ),
				path.resolve( ROOT_PATH, 'replica.my.cnf' )
			];
			if ( TOOLFORGE && process.env.TOOL_DATA_DIR ) {
				searchPaths.splice(
					0, 0,
					path.resolve( process.env.TOOL_DATA_DIR, '.replica.my.cnf' ),
					path.resolve( process.env.TOOL_DATA_DIR, 'replica.my.cnf' )
				);
			} else {
				searchPaths.splice(
					0, 0,
					path.resolve( os.homedir(), '.replica.my.cnf' ),
					path.resolve( os.homedir(), 'replica.my.cnf' )
				);
			}
			await this.readMyCnf( searchPaths )
				.then( ( creds ) => {
					user = user || creds.user;
					password = password || creds.password;
				} );
		}

		return { user, password };
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

		const credentials = await this.getCredentials(
			host !== 'tools.db.svc.wikimedia.cloud'
		);

		if ( !credentials || !credentials.user || !credentials.password ) {
			Log.error( 'No database credentials found!' );
			Log.info( 'Provide an SQL user/password or a valid replica.my.cnf.' );
			Log.info( 'See the README for more information.' );
		}

		return knex( {
			client: 'mysql2',
			connection: {
				host,
				port,
				...credentials,
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
