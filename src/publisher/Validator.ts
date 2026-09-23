import { MetadataCache, TFile, Vault } from "obsidian";

export interface ValidationError {
	type: "error";
	rule: string;
	message: string;
	files: string[];
}

export interface ValidationWarning {
	type: "warning";
	rule: string;
	message: string;
	files: string[];
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: ValidationWarning[];
}

/**
 * Validates the entire set of published notes against frontmatter constraints.
 * Hard errors block publishing. Warnings are shown but don't block.
 */
export function validatePublishedNotes(
	publishedFiles: TFile[],
	metadataCache: MetadataCache
): ValidationResult {
	const errors: ValidationError[] = [];
	const warnings: ValidationWarning[] = [];

	// ── 1. main.index: true must appear exactly once ──────────────────────
	const mainIndexFiles = publishedFiles.filter((f) => {
		const fm = metadataCache.getCache(f.path)?.frontmatter;
		if (fm?.["main.index"] === true) return true;
		const normalized = f.path.replace(/\\/g, "/");
		return !normalized.includes("/") && f.name.toLowerCase() === "index.md";
	});
	if (mainIndexFiles.length === 0) {
		errors.push({
			type: "error",
			rule: "main.index",
			message: "No note has `main.index: true` (or root `index.md`). The home page will be missing.",
			files: [],
		});
	} else if (mainIndexFiles.length > 1) {
		errors.push({
			type: "error",
			rule: "main.index",
			message: `Multiple notes have \`main.index: true\` (or root \`index.md\`) — only one is allowed.`,
			files: mainIndexFiles.map((f) => f.path),
		});
	}

	// ── 2. folder.index: true must appear at most once per folder ─────────
	const folderIndexMap = new Map<string, TFile[]>();
	for (const file of publishedFiles) {
		const fm = metadataCache.getCache(file.path)?.frontmatter;
		const normalized = file.path.replace(/\\/g, "/");
		const isFolderIndex = fm?.["folder.index"] === true || (normalized.includes("/") && file.name.toLowerCase() === "index.md");
		if (isFolderIndex) {
			const folder = file.parent?.path ?? "/";
			const existing = folderIndexMap.get(folder) ?? [];
			existing.push(file);
			folderIndexMap.set(folder, existing);
		}
	}
	for (const [folder, files] of folderIndexMap.entries()) {
		if (files.length > 1) {
			errors.push({
				type: "error",
				rule: "folder.index",
				message: `Folder "${folder}" has ${files.length} notes designated as folder index (\`folder.index: true\` or \`index.md\`) — only one is allowed.`,
				files: files.map((f) => f.path),
			});
		}
	}

	// ── 3. running.title values must be globally unique ───────────────────
	const runningTitleMap = new Map<string, TFile[]>();
	for (const file of publishedFiles) {
		const rt = metadataCache.getCache(file.path)?.frontmatter?.["running.title"];
		if (rt) {
			const alias = String(rt).trim();
			const existing = runningTitleMap.get(alias) ?? [];
			existing.push(file);
			runningTitleMap.set(alias, existing);
		}
	}
	for (const [alias, files] of runningTitleMap.entries()) {
		if (files.length > 1) {
			errors.push({
				type: "error",
				rule: "running.title",
				message: `Duplicate \`running.title: "${alias}"\` found in ${files.length} notes.`,
				files: files.map((f) => f.path),
			});
		}
		// Check format
		if (!/^[a-z0-9-]+$/.test(alias)) {
			errors.push({
				type: "error",
				rule: "running.title",
				message: `\`running.title: "${alias}"\` contains invalid characters. Only a-z, 0-9, and hyphens are allowed.`,
				files: files.map((f) => f.path),
			});
		}
	}



	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}
