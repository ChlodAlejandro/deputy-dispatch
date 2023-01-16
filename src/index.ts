import express from 'express';
import compression from 'compression';
import { RegisterRoutes } from '../gen/routes';
import { ValidateError } from 'tsoa';
import ErrorResponseBuilder, { ErrorFormat } from './models/ErrorResponse';
import swaggerUi from 'swagger-ui-express';
import * as http from 'http';
import axios from 'axios';
import packageInfo from '../package.json';
import { WikimediaSiteMatrix } from './util/WikimediaSiteMatrix';
import toolUserAgent from './util/func/toolUserAgent';
import * as fs from 'fs';
import Logger from 'bunyan';
import bunyanFormat from 'bunyan-format';
import path from 'path';

axios.defaults.headers.common[ 'User-Agent' ] = toolUserAgent;

/**
 * Main class for Dispatch.
 */
export default class Dispatch {

	/**
	 * Singleton instance for this class.
	 */
	public static readonly i = new Dispatch();

	/**
	 * The path to the log folder.
	 */
	static readonly logPath = path.resolve( __dirname, '..', '.logs' );

	/**
	 * The Zoomiebot log. Logs to the bot `.logs` folder and stdout.
	 */
	log: Logger;
	app: express.Express;
	server: http.Server;

	/**
	 * Private constructor for singleton instantiation.
	 */
	private constructor() {
		/* ignored */
	}

	/**
	 * Set up the bunyan logger.
	 */
	setupLogger(): void {
		if ( !fs.existsSync( Dispatch.logPath ) ) {
			fs.mkdirSync( Dispatch.logPath );
		}
		const logFile = path.resolve( Dispatch.logPath, 'dispatch.log' );
		const logFileStream = fs.createWriteStream(
			logFile, { flags: 'a', encoding: 'utf8' }
		);

		this.log = Logger.createLogger( {
			name: 'Dispatch',
			level: process.env.NODE_ENV === 'development' ? 10 : 30,
			stream: process.env.ZOOMIE_RAWLOG ? process.stdout : bunyanFormat( {
				outputMode: 'long',
				levelInString: true
			}, process.stdout )
		} );
		this.log.addStream( {
			level: 'trace',
			stream: logFileStream
		} );
	}

	/**
	 * Verifies the current execution environment before doing anything.
	 */
	verifyEnvironment() {
		this.log.info( 'Performing environment checks...' );
		if ( !process.env.DISPATCH_SELF_OAUTH_ACCESS_TOKEN ) {
			this.log.fatal( 'Self OAuth 2 access token missing' );
			process.exit( 129 );
		}
		const PORT = process.env.DISPATCH_PORT || process.env.PORT;
		if ( PORT && ( isNaN( +PORT ) || +PORT > 65535 || +PORT < 1 ) ) {
			this.log.fatal( 'Bad port' );
			process.exit( 128 );
		}
	}

	/**
	 * Sets up the Express server.
	 */
	setupExpress() {
		this.log.info( 'Setting up Express server...' );
		this.app = express();
		this.app.disable( 'x-powered-by' );

		// Use body parser to read sent json payloads
		this.log.debug( 'Registering middleware (parsers)...' );
		this.app.use( compression() );
		this.app.use( express.json() );
		this.app.use( express.urlencoded( {
			extended: true
		} ) );

		this.log.debug( 'Registering middleware (access control)...' );
		this.app.use( async function ( req, res, next ) {
			res.header( 'Server', `${ packageInfo.name }/${ packageInfo.version }` );
			res.header( 'X-Clacks-Overhead', 'GNU Terry Pratchett' );

			try {
				// Allow Wikimedia sites to use Dispatch
				const origin = req.header( 'Origin' );
				if ( origin && await WikimediaSiteMatrix.i.getOrigin( origin ) ) {
					res.header( 'Access-Control-Allow-Origin' );
					res.header( 'Vary', 'Origin' );
				}
			} catch ( e ) {
				// Cannot verify origin. Don't attach origin headers at all.
				console.error( 'Failed to verify origin.', e );
			}

			Dispatch.i.log.trace( `${req.method} ${req.path} HTTP/${req.httpVersion}`, {
				ip: req.ip,
				ips: req.ips || undefined,
				query: req.query || undefined
			} );

			next();
		} );

		// Documentation endpoints
		this.log.debug( 'Registering middleware (docs)...' );
		this.app.use( '/docs', swaggerUi.serve, async (
			req: express.Request,
			res: express.Response
		) => {
			return res.send(
				swaggerUi.generateHTML( await import( '../gen/swagger.json' ) )
			);
		} );

		// Register actual endpoint routes
		this.log.debug( 'Registering middleware (routes)...' );
		RegisterRoutes( this.app );

		// Register handler for missing parameters, etc.
		this.log.debug( 'Registering middleware (errors)...' );
		this.app.use( function errorHandler(
			err: unknown,
			req: express.Request,
			res: express.Response,
			next: express.NextFunction
		): express.Response | void {
			if ( err instanceof ValidateError ) {
				const errorBuilder = new ErrorResponseBuilder();
				const errorFormat = req.query.errorformat as ErrorFormat;

				for ( const field in err.fields ) {
					const details = err.fields[ field ];
					errorBuilder.add(
						details.value === undefined ?
							'missingparam' : 'invalidparam',
						{
							text: details.message,
							key: details.value === undefined ?
								'apierror-missingparam' : 'apierror-invalidparam',
							params: [ field ]
						}
					);
				}

				return res.status( 422 ).json( errorBuilder.build( errorFormat ) );
			}

			if ( err instanceof Error ) {
				console.error( err );
				// Avoid relying on ErrorResponseBuilder
				return res.status( 500 ).json( {
					message: 'Internal Server Error'
				} );
			}

			next();
		} );
	}

	/**
	 * Start the bot.
	 */
	async start() {
		this.setupLogger();
		this.log.info( `Deputy Dispatch v${packageInfo.version} is starting...` );

		this.verifyEnvironment();
		this.setupExpress();

		const port = +( process.env.DISPATCH_PORT || process.env.PORT || 8080 );
		this.server = this.app.listen( port, () => {
			this.log.info( `Server started on port ${port}` );
		} );
	}

	/**
	 *
	 */
	stop() {
		this.server.close();
	}

}

Dispatch.i.start();

process.on( 'uncaughtException', ( err ) => {
	console.error( 'Uncaught exception: ' + err.message, err );
} );
process.on( 'unhandledRejection', ( err ) => {
	console.error( 'Unhandled rejection.', err );
} );

process.once( 'SIGINT', function () {
	// noinspection JSIgnoredPromiseFromCall
	Dispatch.i.stop();
} );
process.once( 'SIGTERM', function () {
	// noinspection JSIgnoredPromiseFromCall
	Dispatch.i.stop();
} );
