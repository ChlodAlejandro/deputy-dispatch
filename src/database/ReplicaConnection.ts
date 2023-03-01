import DatabaseConnection from './DatabaseConnection';
import { Knex } from 'knex';
import { SiteMatrixSite } from '../util/WikimediaSiteMatrix';
import Dispatch from '../Dispatch';

/**
 * Toolforge Replica database connection handler.
 */
export default class ReplicaConnection extends DatabaseConnection {

	/**
	 * Opens a new connection to a Toolforge database. This may be a
	 * replica or a ToolsDB database.
	 *
	 * @param site
	 * @param type The database type to use. `analytics` allows longer but slower
	 * queries, while `web` is faster and should be used for user interfaces.
	 */
	static async connect( site: SiteMatrixSite, type: 'analytics' | 'web' ): Promise<Knex> {
		if ( type !== 'analytics' && type !== 'web' ) {
			throw new Error( 'Invalid database type' );
		}

		let host: string;
		let port: number;

		if ( Dispatch.toolforge ) {
			host = `${site.dbname}.${type}.db.svc.wikimedia.cloud`;
			port = 3306;
		} else {
			if ( process.env.NODE_ENV === 'development' ) {
				if ( !host ) {
					host = 'localhost';
				}
				if ( !port ) {
					port = 4711;
				}
			}
			if ( process.env[ `DISPATCH_TOOLSDB_HOST_${site.dbname}` ] ) {
				host = process.env[ `DISPATCH_TOOLSDB_HOST_${site.dbname}` ];
			}
			if ( process.env[ `DISPATCH_TOOLSDB_PORT_${site.dbname}` ] ) {
				port = +process.env[ `DISPATCH_TOOLSDB_PORT_${site.dbname}` ];
			}
		}

		if ( !host || !port ) {
			throw new Error( 'Bad ReplicaDB configuration: host or port missing' );
		}

		return super.open( host, port, site.dbname + '_p' );
	}

}
