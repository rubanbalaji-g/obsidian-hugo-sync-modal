/**
 * Validates a Lucide icon name.
 * Lucide icon names are kebab-case strings, e.g. "heart", "file-text", "stethoscope".
 * We do a lightweight format check; the Hugo layout will handle unknown names gracefully.
 */
export function isValidLucideIconName(name: string): boolean {
	return /^[a-z][a-z0-9-]*$/.test(name);
}

/**
 * Normalises an icon name: lowercases and replaces spaces/underscores with hyphens.
 * e.g. "File Text" → "file-text"
 */
export function normaliseLucideIconName(name: string): string {
	return name.trim().toLowerCase().replace(/[\s_]+/g, "-");
}
