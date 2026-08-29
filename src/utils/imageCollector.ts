import { TFile, Vault } from "obsidian";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);

export interface ImageRef {
	/** Raw path/name as written in the note */
	rawRef: string;
	/** Resolved TFile if it exists in the vault, otherwise undefined */
	file?: TFile;
}

/**
 * Extracts all local image references from a markdown note's content.
 * Handles both wikilink format `![[image.png]]` and standard `![alt](path)`.
 * Ignores external URLs (http/https).
 */
export function collectImageRefs(content: string, vault: Vault): ImageRef[] {
	const refs: ImageRef[] = [];
	const seen = new Set<string>();

	// Wikilink images: ![[image.png]] or ![[image.png|300]] or ![[image.png\|300]]
	const wikilinkRe = /!\[\[([^\]]+)\]\]/g;
	let m: RegExpExecArray | null;
	while ((m = wikilinkRe.exec(content)) !== null) {
		const inner = m[1].replace(/\\\|/g, "|");         // unescape \|
		const rawRef = inner.split("|")[0].trim();         // strip size hint
		if (!seen.has(rawRef) && isLocalImage(rawRef)) {
			seen.add(rawRef);
			refs.push({ rawRef, file: resolveFile(rawRef, vault) });
		}
	}

	// Standard markdown images: ![alt](path) or ![alt](path|size)
	const mdRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
	while ((m = mdRe.exec(content)) !== null) {
		const inner = m[2].split("|")[0].trim();
		if (inner.startsWith("http://") || inner.startsWith("https://")) continue;
		const rawRef = decodeURIComponent(inner);
		const name = rawRef.split("/").pop()?.split("\\").pop() ?? rawRef;
		if (!seen.has(name) && isLocalImage(name)) {
			seen.add(name);
			refs.push({ rawRef, file: resolveFile(name, vault) });
		}
	}

	return refs;
}

function isLocalImage(name: string): boolean {
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	return IMAGE_EXTENSIONS.has(ext);
}

function resolveFile(nameOrPath: string, vault: Vault): TFile | undefined {
	// Try direct path first
	const direct = vault.getFileByPath(nameOrPath);
	if (direct) return direct;

	// Fall back to basename match across the entire vault
	const basename = nameOrPath.split("/").pop()?.split("\\").pop() ?? nameOrPath;
	return vault.getFiles().find(
		(f) => f.name === basename && IMAGE_EXTENSIONS.has(f.extension.toLowerCase())
	);
}
