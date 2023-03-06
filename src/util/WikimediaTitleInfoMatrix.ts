import axios from 'axios';
import { SiteMatrixSite } from './WikimediaSiteMatrix';
import type { Namespace } from './Title';

interface TitleInfo {
	legaltitlechars: string;
	namespaces: Record<number, Namespace>;
	namespaceAliases: { id: number, 'alias': string }[];
}

/**
 *
 */
export class WikimediaTitleInfoMatrix {

	/**
	 * Singleton instance for this class.
	 */
	public static readonly i = new WikimediaTitleInfoMatrix();

	/**
	 * The raw site matrix.
	 *
	 * @private
	 */
	private matrix = new Map<string, TitleInfo>();

	/**
	 * Private constructor for singleton instantiation.
	 */
	private constructor() {
		/* ignored */
	}

	/**
	 * Get the namespaces of a given wiki.
	 *
	 * @param site
	 */
	async fetch( site: SiteMatrixSite ): Promise<TitleInfo> {
		if ( this.matrix.has( site.dbname ) ) {
			return this.matrix.get( site.dbname );
		}

		const infoRequest = await axios.get(
			`${site.url}/w/api.php?${
				new URLSearchParams( {
					format: 'json',
					formatversion: '2',
					utf8: 'true',
					action: 'query',
					meta: 'siteinfo',
					siprop: 'general|namespaces|namespacealiases'
				} )
			}`,
			{ responseType: 'json' }
		).then( r => r.data.query );

		const titleInfo = {
			legaltitlechars: infoRequest.general.legaltitlechars,
			namespaces: infoRequest.namespaces,
			namespaceAliases: infoRequest.namespacealiases
		};
		this.matrix.set( site.dbname, titleInfo );

		return titleInfo;
	}

	/**
	 * Flushes the cache.
	 */
	flush() {
		this.matrix.clear();
	}
}
