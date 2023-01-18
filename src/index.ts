import * as dotenv from 'dotenv';
import axios from 'axios';
import toolUserAgent from './util/func/toolUserAgent';
import path from 'path';

if ( process.env.HOME ) {
	dotenv.config( {
		override: true,
		path: path.join( process.env.HOME, '.env' )
	} );
}
dotenv.config( {
	override: true,
	path: path.resolve( __dirname, '..', '.env' )
} );

axios.defaults.headers.common[ 'User-Agent' ] = toolUserAgent;
import( './Dispatch' ).then( ( v ) => {
	v.start();
} );
