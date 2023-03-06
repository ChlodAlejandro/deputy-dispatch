import path from 'path';

export const ROOT_PATH = path.resolve( __dirname, '..' );

/**
 * The path to the log folder.
 */
export const LOG_PATH = path.resolve( ROOT_PATH, '.logs' );

/**
 * Whether we're running on Toolforge.
 */
export const TOOLFORGE = path.resolve( ROOT_PATH ) ===
	'/data/project/deputy/www/js';
