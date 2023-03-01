import MwnTitle, { MwnTitleStatic } from 'mwn/build/title';
import { SiteMatrixSite } from './WikimediaSiteMatrix';
import { WikimediaTitleInfoMatrix } from './WikimediaTitleInfoMatrix';

export interface Namespace {
	/**
	 * Namespace ID
	 */
	id: number,
	/**
	 * Case sensitivity of the namespace name.
	 */
	case: 'first-letter' | 'case-sensitive',
	/**
	 * Localized name of the namespace.
	 */
	name: string;
	/**
	 * Canonical name of the namespace.
	 */
	canonical: string,

	/**
	 * `true` if this namespace allows subpages
	 */
	subpages?: boolean,
	/**
	 * `true` if this is the content namespace
	 */
	content?: boolean,
	/**
	 * `true` if pages in this namespace cannot be transcluded
	 */
	nonincludable?: boolean;
	/**
	 * Only set if this namespace has namespace-wide protection
	 * This is set to the right required to edit pages in this namespace
	 */
	namespaceprotection?: string,
	/**
	 * Only set if this namespace does not use `wikitext` by default
	 * This is set to the content model used by default
	 */
	defaultcontentmodel?: string
}

/**
 *
 */
export default class TitleFactory {

	private static titleCache = new Map<string, MwnTitleStatic>();

	/**
	 * Gets the mw.Title instance for a Wikimedia site.
	 *
	 * Pulls titling data from Wikimedia if needed.
	 *
	 * @param site
	 */
	static async get( site: SiteMatrixSite ): Promise<MwnTitleStatic> {
		if ( TitleFactory.titleCache.has( site.dbname ) ) {
			return TitleFactory.titleCache.get( site.dbname );
		}

		const title = MwnTitle();
		title.processNamespaceData(
			await WikimediaTitleInfoMatrix.i.fetch( site )
				.then( v => ( { query: {
					general: {
						legaltitlechars: v.legaltitlechars
					},
					namespaces: v.namespaces,
					namespacealiases: v.namespaceAliases
				} } ) )
		);

		TitleFactory.titleCache.set( site.dbname, title );

		return title;
	}
}
