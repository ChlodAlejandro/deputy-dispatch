import axios from 'axios';

export interface SiteMatrixLanguage {
	/**
	 * Language code (usually ISO 639 1–3 code) for this language.
	 */
	code: string;
	/**
	 * Name of the language.
	 */
	name: string;
	/**
	 * Directionality of the language (left-to-right or right-to-left)
	 */
	dir: 'ltr' | 'rtl';
	/**
	 * Local name of the language; in this case the name of the language in English.
	 */
	localname: string;
	/**
	 * Sites for this language
	 */
	site: SiteMatrixLanguageSite[];
}

export interface SiteMatrixLanguageSite {
	/**
	 * Origin of the wiki.
	 *
	 * @example "https://en.wikipedia.org"
	 */
	url: string;
	/**
	 * Database name of the wiki.
	 */
	dbname: string;
	/**
	 * Code name of this wiki type.
	 *
	 * @example "wiki" for Wikipedias, "wiktionary" for Wiktionaries.
	 */
	code: string;
	/**
	 * Name of the website in the local language.
	 *
	 * @example "Wikipédia" for frwiki
	 */
	sitename: string;
	/**
	 * Key exists if the wiki is private.
	 */
	private?: '';
	/**
	 * Key exists if the wiki is closed.
	 */
	closed?: '';
	/**
	 * Key exists if the wiki is fishbowled (only logged-in users can edit).
	 */
	fishbowl?: '';
	/**
	 * Key exists if the wiki does not use Wikimedia single unified login (SUL).
	 */
	nonglobal?: '';
}

interface SiteMatrixSite extends SiteMatrixLanguageSite {
	/**
	 * Language code (ISO 639 1–3 code) for this language. Might not be an actual
	 * language code sometimes (e.g. "advisors" for advisors.wikimedia.org).
	 */
	lang: string;
}

export type SiteMatrix = {
	[ key: number ]: SiteMatrixLanguage,
	specials: SiteMatrixSite[]
	/**
	 * Count of all wikis connected to this site matrix.
	 */
	count: number
}

/**
 *
 */
export class WikimediaSiteMatrix {

	/**
	 * Singleton instance for this class.
	 */
	public static readonly i = new WikimediaSiteMatrix();

	/**
	 * The raw site matrix.
	 *
	 * @private
	 */
	private matrix: SiteMatrix;
	/**
	 * All wikis indexed by database name.
	 *
	 * @private
	 */
	private matrixDbNameIndex: Record<string, SiteMatrixSite>;
	/**
	 * All wikis indexed by hostname.
	 *
	 * @private
	 */
	private matrixHostnameIndex: Record<string, SiteMatrixSite>;

	/**
	 * Private constructor for singleton instantiation.
	 */
	private constructor() {
		/* ignored */
	}

	/**
	 * Download the matrix from Wikimedia.
	 */
	async fetch(): Promise<SiteMatrix> {
		const matrix: SiteMatrix = await axios.get(
			'https://meta.wikimedia.org/w/api.php?action=sitematrix&format=json',
			{ responseType: 'json' }
		).then( r => r.data.sitematrix );

		this.matrix = matrix;
		this.matrixDbNameIndex = {};
		this.matrixHostnameIndex = {};

		for ( const i of Object.keys( matrix ) ) {
			if ( !isNaN( +i ) ) {
				for ( const site of matrix[ i ].site ) {
					const appliedSite = Object.assign( matrix[ i ].site, { lang: matrix[ i ] } );

					this.matrixDbNameIndex[ site.dbname ] = appliedSite;
					this.matrixHostnameIndex[ new URL( site.url ).hostname ] = appliedSite;
				}
			}
		}
		for ( const special of matrix.specials ) {
			this.matrixDbNameIndex[ special.dbname ] = special;
			this.matrixHostnameIndex[ new URL( special.url ).hostname ] = special;
		}

		return this.matrix;
	}

	/**
	 * Get the matrix.
	 *
	 * @param noCache Set to `true` if the cache should be avoided
	 */
	async get( noCache?: boolean ): Promise<SiteMatrix> {
		return ( noCache ? null : this.matrix ) ?? await this.fetch();
	}

	/**
	 * Gets a given wiki from a hostname.
	 *
	 * @param hostname
	 * @return The site, `null` if not found.
	 */
	async getHost( hostname: string ): Promise<SiteMatrixSite | null> {
		await this.get();
		return this.matrixHostnameIndex[ hostname ];
	}

	/**
	 * Gets a given wiki from a DB name.
	 *
	 * @param dbName
	 * @return The site, `null` if not found.
	 */
	async getDbName( dbName: string ): Promise<SiteMatrixSite | null> {
		await this.get();
		return this.matrixDbNameIndex[ dbName ];
	}

	/**
	 * Flushes the cache.
	 */
	flush() {
		this.matrix = undefined;
		this.matrixDbNameIndex = undefined;
		this.matrixHostnameIndex = undefined;
	}

}
