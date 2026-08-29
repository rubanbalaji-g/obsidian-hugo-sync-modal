import { HugoPublisherSettings, STRIP_KEYS } from "src/models/settings";
import { BacklinkEntry } from "src/compiler/BacklinkMapper";
import { normaliseLucideIconName } from "src/utils/lucide";

export interface TransformedFrontmatter {
	/** The YAML frontmatter string ready to prepend to the Hugo note */
	yaml: string;
	/** Canonical Hugo URL slug for this note */
	slug: string;
}

/**
 * Transforms raw Obsidian frontmatter into Hugo-ready YAML frontmatter.
 *
 * Maps:
 *   publish: true          → (removed)
 *   main.index: true       → layout: "home", isIndex: true
 *   folder.index: true     → isIndex: true
 *   running.title: "nnh"  → aliases: ["/nnh"]
 *   note.icon: "heart"     → icon: "heart" (Lucide name)
 *   created / updated      → forwarded as-is
 *   tags                   → forwarded as-is
 *
 * Strips all internal Obsidian/DG keys.
 */
export function transformFrontmatter(
	raw: Record<string, unknown>,
	noteSlug: string,
	settings: HugoPublisherSettings,
	backlinks: BacklinkEntry[] = []
): TransformedFrontmatter {
	const out: Record<string, unknown> = {};

	// Title — use explicit title or derive from slug
	out["title"] = raw["title"] ?? noteSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

	// Index flags
	if (raw["main.index"] === true) {
		out["layout"] = "home";
		out["isIndex"] = true;
		out["main.index"] = true;
	} else if (raw["folder.index"] === true) {
		out["isIndex"] = true;
		out["folder.index"] = true;
	}
	out["publish"] = true;

	// Running title → Hugo alias
	if (raw["running.title"]) {
		const alias = String(raw["running.title"]).trim();
		out["aliases"] = [`/${alias}`];
	}

	// Lucide icon
	if (settings.showNoteIcons && raw["note.icon"]) {
		out["icon"] = normaliseLucideIconName(String(raw["note.icon"]));
	}

	// Timestamps
	if (raw["created"]) out["date"] = raw["created"];
	if (raw["updated"]) out["lastmod"] = raw["updated"];

	// Tags
	if (raw["tags"]) out["tags"] = raw["tags"];

	// Backlinks
	if (backlinks.length > 0) {
		out["backlinks"] = backlinks;
	}

	// Pass-through: forward all non-stripped keys
	if (settings.passThroughFrontmatter) {
		for (const [key, value] of Object.entries(raw)) {
			if (!STRIP_KEYS.has(key) && !(key in out)) {
				out[key] = value;
			}
		}
	}

	return { yaml: toYaml(out), slug: noteSlug };
}

function toYaml(obj: Record<string, unknown>): string {
	const lines: string[] = ["---"];
	for (const [key, value] of Object.entries(obj)) {
		if (value === null || value === undefined) continue;
		if (Array.isArray(value)) {
			if (value.length === 0) continue;
			// Check if it's an array of objects (like backlinks)
			if (typeof value[0] === "object") {
				lines.push(`${key}:`);
				for (const item of value as Record<string, unknown>[]) {
					const entries = Object.entries(item);
					lines.push(`  - ${entries[0][0]}: ${yamlValue(entries[0][1])}`);
					for (let i = 1; i < entries.length; i++) {
						lines.push(`    ${entries[i][0]}: ${yamlValue(entries[i][1])}`);
					}
				}
			} else {
				lines.push(`${key}:`);
				for (const item of value) {
					lines.push(`  - ${yamlValue(item)}`);
				}
			}
		} else {
			lines.push(`${key}: ${yamlValue(value)}`);
		}
	}
	lines.push("---");
	return lines.join("\n");
}

function yamlValue(v: unknown): string {
	if (typeof v === "string") {
		// Quote strings that need it
		if (v.includes(":") || v.includes("#") || v.includes("'") || v.startsWith("!")) {
			return `"${v.replace(/"/g, '\\"')}"`;
		}
		return v;
	}
	if (typeof v === "boolean") return String(v);
	if (typeof v === "number") return String(v);
	return String(v);
}
