import { MetadataCache, TFile, Vault } from "obsidian";
import { slugify } from "src/utils/slugify";

export interface BacklinkEntry {
	title: string;
	url: string;
}

/** Map of target file path → list of backlink entries pointing to it */
export type BacklinkMap = Map<string, BacklinkEntry[]>;

const WIKILINK_RE = /\[\[([^\]|#]+)(?:[|#][^\]]*)?]]/g;

/**
 * Builds a complete backlink map across all published notes.
 * For each published note, resolves all its wikilinks and records them
 * as backlinks on the target note.
 */
export function buildBacklinkMap(
	publishedFiles: TFile[],
	vault: Vault,
	metadataCache: MetadataCache
): BacklinkMap {
	const backlinkMap: BacklinkMap = new Map();

	// Initialise empty arrays for all published notes
	for (const file of publishedFiles) {
		backlinkMap.set(file.path, []);
	}

	for (const sourceFile of publishedFiles) {
		const cache = metadataCache.getCache(sourceFile.path);
		if (!cache?.links) continue;

		for (const link of cache.links) {
			const resolved = metadataCache.getFirstLinkpathDest(link.link, sourceFile.path);
			if (!resolved || !backlinkMap.has(resolved.path)) continue;

			const entry: BacklinkEntry = {
				title: sourceFile.basename,
				url: buildUrl(sourceFile),
			};

			const existing = backlinkMap.get(resolved.path)!;
			// Deduplicate
			if (!existing.some((e) => e.url === entry.url)) {
				existing.push(entry);
			}
		}
	}

	return backlinkMap;
}

function buildUrl(file: TFile): string {
	const folder = file.parent?.name ?? "";
	const slug = slugify(file.basename);
	if (!folder || folder === "/") return `/${slug}`;
	return `/${slugify(folder)}/${slug}`;
}
