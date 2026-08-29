import { MetadataCache, TFile, Vault } from "obsidian";
import { slugify, slugifyFolder } from "src/utils/slugify";

export interface ResolvedWikilink {
	/** Original wikilink text, e.g. "Neonatal Hyperbilirubinemia" */
	original: string;
	/** Display text (after | if present) */
	displayText: string;
	/** Resolved Hugo relref path, or null if unresolvable */
	hugoPath: string | null;
	/** Whether the target note has publish: true */
	isPublished: boolean;
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

/**
 * Resolves all [[wikilinks]] in a markdown string to Hugo relref links.
 *
 * Published notes → `[display]({{< relref "slug" >}})`
 * Unpublished notes → `[display](/unpublished)` (site shows 404)
 * Unresolvable → plain text with display name
 */
export function resolveWikilinks(
	content: string,
	sourceFile: TFile,
	vault: Vault,
	metadataCache: MetadataCache,
	publishedPaths: Set<string>
): string {
	return content.replace(WIKILINK_RE, (_match, inner) => {
		// Strip image wikilinks (handled by image compiler step)
		if (inner.startsWith("!")) return _match;

		const [linkPart, ...aliasParts] = inner.split("|");
		const linkTarget = linkPart.trim();
		const displayText = aliasParts.length > 0 ? aliasParts.join("|").trim() : linkTarget;

		// Resolve to TFile via Obsidian's metadata cache
		const resolved = metadataCache.getFirstLinkpathDest(linkTarget, sourceFile.path);

		if (!resolved) {
			// Unresolvable — render as plain text
			return displayText;
		}

		const folder = resolved.parent?.name ?? "";
		const slug = slugify(resolved.basename);
		const sectionSlug = folder && folder !== "/" ? `/${slugifyFolder(folder)}/${slug}` : `/${slug}`;

		if (publishedPaths.has(resolved.path)) {
			return `[${displayText}]({{< relref "${slug}" >}})`;
		} else {
			// Linked note exists but not published — goes to 404
			return `[${displayText}](/unpublished)`;
		}
	});
}

/**
 * Returns a Set of vault paths for all published notes.
 */
export function getPublishedPaths(vault: Vault, metadataCache: MetadataCache): Set<string> {
	const paths = new Set<string>();
	for (const file of vault.getMarkdownFiles()) {
		const fm = metadataCache.getCache(file.path)?.frontmatter;
		if (fm?.["publish"] === true) paths.add(file.path);
	}
	return paths;
}
