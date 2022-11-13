import express from 'express';
import compression from 'compression';
import { RegisterRoutes } from '../gen/routes';
import { ValidateError } from 'tsoa';
import ErrorResponseBuilder, { ErrorFormat } from './models/ErrorResponse';
import swaggerUi from 'swagger-ui-express';
import * as http from 'http';

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
	 *
	 */
	setupExpress() {
		this.app = express();

		// Use body parser to read sent json payloads
		this.app.use( compression() );
		this.app.use( express.json() );
		this.app.use( express.urlencoded( {
			extended: true
		} ) );

		this.app.use( '/docs', swaggerUi.serve, async (
			req: express.Request,
			res: express.Response
		) => {
			return res.send(
				swaggerUi.generateHTML( await import( '../gen/swagger.json' ) )
			);
		} );

		RegisterRoutes( this.app );

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
				return res.status( 500 ).json( {
					message: 'Internal Server Error'
				} );
			}

			next();
		} );
	}

	/**
	 *
	 */
	start() {
		this.setupExpress();
		this.server = this.app.listen( process.env.PORT || 8080, () => {
			console.log( 'Server started' );
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
