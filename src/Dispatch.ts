import path from 'path';
import express from 'express';
import http from 'http';
import packageInfo from '../package.json';
import { WikimediaSiteMatrix } from './util/WikimediaSiteMatrix';
import { ValidateError } from 'tsoa';
import ErrorResponseBuilder, { ErrorFormat } from './models/ErrorResponse';
import { RegisterRoutes } from '../gen/routes';
import swaggerUi from 'swagger-ui-express';
import compression from 'compression';
import DatabaseConnection from './database/DatabaseConnection';
import Log from './util/Log';
import { TOOLFORGE } from './DispatchConstants';

/**
 * Main class for Dispatch.
 */
export default class Dispatch {

	/**
	 * Singleton instance for this class.
	 */
	public static readonly i = new Dispatch();

	app: express.Express;
	server: http.Server;

	/**
	 * Private constructor for singleton instantiation.
	 */
	private constructor() {
		/* ignored */
	}

	/**
	 * Verifies the current execution environment before doing anything.
	 */
	verifyEnvironment() {
		Log.info( 'Performing environment checks...' );
		if ( !process.env.DISPATCH_SELF_OAUTH_ACCESS_TOKEN ) {
			Log.fatal( 'Self OAuth 2 access token missing' );
			process.exit( 129 );
		}
		const PORT = process.env.DISPATCH_PORT || process.env.PORT;
		if ( PORT && ( isNaN( +PORT ) || +PORT > 65535 || +PORT < 1 ) ) {
			Log.fatal( 'Bad port' );
			process.exit( 128 );
		}
	}

	/**
	 * Sets up the Express server.
	 */
	async setupExpress() {
		Log.info( 'Setting up Express server...' );
		this.app = express();
		this.app.disable( 'x-powered-by' );

		// Use body parser to read sent json payloads
		Log.debug( 'Registering middleware (parsers)...' );
		this.app.use( compression() );
		this.app.use( express.json() );
		this.app.use( express.urlencoded( {
			extended: true
		} ) );

		Log.debug( 'Registering middleware (access control)...' );
		this.app.use( async function ( req, res, next ) {
			res.header( 'Server', `${ packageInfo.name }/${ packageInfo.version }` );

			try {
				// Allow Wikimedia sites to use Dispatch
				const origin = req.header( 'Origin' );
				if ( origin && await WikimediaSiteMatrix.i.getOrigin( origin ) ) {
					res.header( 'Access-Control-Allow-Origin', '*' );
					res.header( 'Vary', 'Origin' );
				}
			} catch ( e ) {
				// Cannot verify origin. Don't attach origin headers at all.
				console.error( 'Failed to verify origin.', e );
			}

			Log.trace( `${ req.method } ${ req.path } HTTP/${ req.httpVersion }`, {
				ip: req.ip,
				ips: req.ips || undefined,
				query: req.query || undefined
			} );

			next();
		} );
		if ( !TOOLFORGE ) {
			this.app.use( function ( req, res, next ) {
				res.header( 'X-Clacks-Overhead', 'GNU Terry Pratchett' );
				next();
			} );
		}

		// Documentation endpoints
		Log.debug( 'Registering middleware (docs)...' );
		const swaggerSchema: any = Object.assign(
			{},
			...( await Promise.all( [
				import( '../gen/swagger.json' ),
				import( './schema/swagger-overrides.json' )
			] ) )
		);
		swaggerSchema.info.version = packageInfo.version;
		this.app.use( '/docs', swaggerUi.serve, swaggerUi.setup(
			swaggerSchema,
			{
				customCss: 'img[alt="Swagger UI"] { content: url("/favicon.ico") }',
				customSiteTitle: 'Deputy Dispatch API',
				customfavIcon: '/favicon.ico'
			}
		) );

		// Register actual endpoint routes
		Log.debug( 'Registering middleware (routes)...' );
		RegisterRoutes( this.app );

		// Static files handler
		this.app.use( '/', express.static( path.join( __dirname, 'public' ) ) );

		// Register handler for missing parameters, etc.
		Log.debug( 'Registering middleware (errors)...' );
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
		Log.info( `Deputy Dispatch v${ packageInfo.version } is starting...` );
		Log.info( `Toolforge mode: ${TOOLFORGE ? 'ON' : 'OFF'}` );

		this.verifyEnvironment();
		await DatabaseConnection.verifyEnvironment();
		await this.setupExpress();

		const port = +( process.env.DISPATCH_PORT || process.env.PORT || 8080 );
		this.server = this.app.listen( port, () => {
			Log.info( `Server started on port ${ port }` );
		} );
	}

	/**
	 *
	 */
	stop() {
		this.server.close();
	}

}

/**
 * Starts Dispatch. Called from the index class.
 */
export function start() {
	Dispatch.i.start();

	process.on( 'uncaughtException', ( err ) => {
		try {
			Log.error( 'Uncaught exception: ' + err.message, err );
		} catch ( e ) {
			console.error( err );
		}
	} );
	process.on( 'unhandledRejection', ( err ) => {
		try {
			Log.error( 'Unhandled rejection.', err );
		} catch ( e ) {
			console.error( err );
		}
	} );

	process.once( 'SIGINT', function () {
		// noinspection JSIgnoredPromiseFromCall
		Dispatch.i.stop();
	} );
	process.once( 'SIGTERM', function () {
		// noinspection JSIgnoredPromiseFromCall
		Dispatch.i.stop();
	} );
}
