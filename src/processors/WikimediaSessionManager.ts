import { mwn } from 'mwn';
import { SiteMatrixSite, WikimediaSiteMatrix } from '../util/WikimediaSiteMatrix';
import toolUserAgent from '../util/func/toolUserAgent';

/**
 *
 */
export default class WikimediaSessionManager {

	static clientStore: Map<string, mwn> = new Map();

	/**
	 *
	 * @param wiki The DB name of the wiki, or a SiteMatrixSite.
	 */
	static async getClient( wiki: string | SiteMatrixSite ): Promise<mwn> {
		if ( typeof wiki === 'string' ) {
			wiki = await WikimediaSiteMatrix.i.getDbName( wiki );
			if ( !wiki ) {
				throw new Error( 'Invalid wiki DB name provided!' );
			}
		}

		if ( this.clientStore.has( wiki.dbname ) ) {
			return this.clientStore.get( wiki.dbname );
		}

		// No stored instance. Create one.
		const client = await this.createClient( wiki );
		this.clientStore.set( wiki.dbname, client );
		return client;
	}

	/**
	 * Creates a new bot client with mwn.
	 *
	 * @param wiki The wiki to create a client for
	 * @param accessToken The access token to use. Defaults to environment token.
	 */
	static async createClient( wiki: SiteMatrixSite, accessToken?: string ): Promise<mwn> {
		const apiUrl = new URL( '/w/api.php', wiki.url ).href;
		return await mwn.init( {
			apiUrl,
			OAuth2AccessToken: accessToken ?? process.env.DISPATCH_SELF_OAUTH_ACCESS_TOKEN,
			userAgent: toolUserAgent,
			defaultParams: {
				// Ensure log-in state
				assert: 'user'
			}
		} );
	}

}
