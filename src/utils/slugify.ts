/**
 * Converts a note filename or title into a Hugo-compatible URL slug.
 * e.g. "Neonatal Hyperbilirubinemia (NNH)" → "neonatal-hyperbilirubinemia-nnh"
 */
export function slugify(input: string): string {
	return input
		.normalize("NFD")                       // decompose accented chars
		.replace(/[\u0300-\u036f]/g, "")        // strip combining diacritics
		.replace(/[^\w\s-]/g, " ")              // replace non-word chars with space
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, "-")               // spaces/underscores → hyphens
		.replace(/-+/g, "-")                   // collapse multiple hyphens
		.replace(/^-+|-+$/g, "");              // trim leading/trailing hyphens
}

/**
 * Converts a vault folder path into a Hugo section slug.
 * Strips emoji prefix (e.g. "👶 Neonatology" → "neonatology").
 */
export function slugifyFolder(folder: string): string {
	return slugify(folder.replace(/^[\p{Emoji}\s]+/u, "").trim());
}
