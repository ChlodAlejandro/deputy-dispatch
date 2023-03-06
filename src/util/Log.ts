import fs from 'fs';
import path from 'path';
import Logger from 'bunyan';
import bunyanFormat from 'bunyan-format';
import { LOG_PATH } from '../DispatchConstants';

if ( !fs.existsSync( LOG_PATH ) ) {
	fs.mkdirSync( LOG_PATH );
}
const logFile = path.resolve( LOG_PATH, 'dispatch.log' );
const logFileStream = fs.createWriteStream(
	logFile, { flags: 'a', encoding: 'utf8' }
);

const logger = Logger.createLogger( {
	name: 'Dispatch',
	level: process.env.NODE_ENV === 'development' ? 10 : 30,
	stream: process.env.DISPATCH_RAWLOG ? process.stdout : bunyanFormat( {
		outputMode: 'long',
		levelInString: true
	}, process.stdout )
} );
logger.addStream( {
	level: 'trace',
	stream: logFileStream
} );

export default logger;
